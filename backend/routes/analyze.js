import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { url, pageTitle, pageText, history } = req.body;
    // Default goal to 'general productivity' if not set — avoids 400 for new users
    const userGoal = req.body.userGoal || 'general productivity';
    // Parse strictMode robustly (may arrive as boolean or string from extension)
    const strictMode = req.body.strictMode === true || req.body.strictMode === 'true';

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log(`[SENTINEL] REQUEST RECEIVED — URL: ${url} | Goal: ${userGoal} | Strict: ${strictMode}`);

    // 1. Call Firecrawl API
    let firecrawlData = "";
    try {
      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true
        })
      });

      if (firecrawlResponse.ok) {
        const fcResult = await firecrawlResponse.json();
        if (fcResult.success && fcResult.data && fcResult.data.markdown) {
          firecrawlData = fcResult.data.markdown.substring(0, 1500); // Limit size
        }
      } else {
        console.warn(`[SENTINEL] Firecrawl API failed with status: ${firecrawlResponse.status}`);
      }
    } catch (fcError) {
      console.error('[SENTINEL] Firecrawl error:', fcError);
    }

    // Fallback to pageText if Firecrawl fails or returns empty
    const contentToAnalyze = firecrawlData || pageText || "No content available.";

    // 2. Call OpenRouter API
    const strictInstruction = strictMode
      ? `IMPORTANT: Strict Mode is ON. Be very strict. If the page is not directly and clearly related to the goal, mark it "off-track" with a score below 40.`
      : `Normal mode: issue gentle warnings for loosely related pages. Only mark "off-track" for clearly unrelated content.`;

    const systemPrompt = `You are SENTINEL, a focus enforcement AI.
Evaluate the user's current page against their goal.
${strictInstruction}
Return ONLY valid JSON matching this exact structure, no markdown formatting, no extra text:
{
  "score": <number 0-100>,
  "status": "<aligned | warning | off-track>",
  "level": "<normal | warning | final | enforce>",
  "message": "<Short coaching message (max 15 words)>",
  "action": "<allow | warn | redirect>",
  "category": "<learning | distraction | entertainment | news | work | social>",
  "suggestions": ["<better_url_1>", "<better_url_2>"],
  "reason": "<One sentence explanation>"
}`;

    const userMessage = `Goal: ${userGoal}
Strict Mode: ${strictMode}
Current URL: ${url}
Page Title: ${pageTitle}
Recent History: ${JSON.stringify(history || [])}
Page Content Extract:
${contentToAnalyze}`;

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://sentinel.local',
        'X-Title': 'SENTINEL'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('[SENTINEL] OpenRouter error:', errorText);
      return res.status(500).json({ error: 'Failed to analyze page via AI' });
    }

    const orResult = await openRouterResponse.json();
    let aiContent = orResult.choices[0].message.content;

    // Clean up potential markdown code blocks
    aiContent = aiContent.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedResult = JSON.parse(aiContent);

    // ============ STRICT MODE ENFORCEMENT (SERVER-SIDE OVERRIDE) ============
    // Deterministic behavior that cannot be 'hallucinated away' by the AI.
    if (strictMode) {
      if (parsedResult.status === 'off-track') {
        parsedResult.level = 'enforce';
        parsedResult.action = 'redirect';
        parsedResult.message = 'Stop. This is not related to your goal.';
        if (parsedResult.score > 30) parsedResult.score = 30;
      } else if (parsedResult.status === 'warning') {
        parsedResult.level = 'final';
        parsedResult.action = 'warn';
        parsedResult.message = `Warning: Stay on task. Goal: ${userGoal.substring(0, 30)}.`;
        if (parsedResult.score > 60) parsedResult.score = 60;
      }
      // 'aligned' pages pass through unchanged
    } else {
      // Normal mode — never auto-redirect, soften enforcement
      if (parsedResult.action === 'redirect') parsedResult.action = 'warn';
      if (parsedResult.level === 'enforce') parsedResult.level = 'warning';
    }

    console.log('[SENTINEL] Analysis complete:', parsedResult.score, parsedResult.status, '| action:', parsedResult.action);
    console.log('[STRICT MODE]', strictMode);
    console.log('[ANALYSIS RESULT]', parsedResult);

    res.json(parsedResult);

  } catch (error) {
    console.error('[SENTINEL] Analyze route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
