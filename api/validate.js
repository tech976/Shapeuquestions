/**
 * Shape U Clinic — open-answer validator (Layer 3).
 *
 * The page cannot call Groq directly: index.html is served verbatim to every
 * visitor, so an API key in it is a public API key. This function holds the
 * key instead and the browser calls it same-origin, with no credential of any
 * kind leaving the server.
 *
 * It answers one question — is this a real attempt at the question asked? —
 * and it answers `valid: true` whenever it cannot be sure. Every failure path
 * below returns valid:true on purpose: a lost real lead costs the clinic far
 * more than a junk one that got through, so a dead API, a timeout, a missing
 * env var and a malformed reply must all behave exactly like a pass.
 *
 * Set GROQ_API_KEY in Vercel → Project → Settings → Environment Variables.
 * It must never appear in this repo.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// 11/11 on the probe set at ~450ms median. A reasoning model, so it needs
// headroom for reasoning tokens even though the reply itself is tiny.
const MODEL      = 'openai/gpt-oss-20b';
const MAX_CHARS  = 300;   // matches the textarea cap, with room to spare
const TIMEOUT_MS = 3000;  // the browser gives up sooner; this is the backstop

const SYSTEM = [
  'You validate one answer from a lead form for Shape U Clinic, a Mumbai',
  'non-surgical weight-loss and body-contouring clinic established 1998.',
  'Treatments: U-Lipolysis ultrasound fat reduction (abdomen, thighs, flanks,',
  'saddlebags, hips, love handles, arms, breast, calf, upper/lower back),',
  'face lifting and chin tuck, NARF skin tightening, body tucks, cellulite',
  'treatment, spot reduction, infra-red detox, EMS, and medical weight',
  'management with doctors and dietitians.',
  '',
  'Q_AREA asks which body area the lead wants treated and the concern to fix.',
  '  In radar: any body area (belly, tummy, thighs, arms, back, hips, love',
  '  handles, double chin, face, neck, calf, flanks), or any concern (excess',
  '  fat, loose or sagging skin, cellulite, inch loss, post-pregnancy fat,',
  '  obesity, wrinkles, wanting to look slimmer or younger).',
  'Q_SINCE asks how long the lead has had the concern.',
  '  In radar: any timeframe at all — "6 months", "2 years", "since delivery",',
  '  "after lockdown", "long time", "recently", "always struggled with this".',
  '',
  'Mark valid=true if the text is a genuine human attempt to answer the',
  'question asked — even a single word, even with typos, even in Hinglish or',
  'Hindi script. Brevity is not a reason to reject.',
  'Mark valid=false ONLY for: empty text, keyboard mash, spam, or text with',
  'nothing to do with a body/face/weight concern (Q_AREA) or with a timeframe',
  '(Q_SINCE) — for example asking about loans or jobs.',
  'When you are unsure, answer true.',
  '',
  'Reply with JSON only: {"valid":boolean,"reason":"at most 8 words"}'
].join('\n');

const pass = (res, reason) => res.status(200).json({ valid: true, reason: reason });

// CommonJS on purpose: this repo has no package.json, so Vercel treats a .js
// file as CommonJS and `export default` would throw at cold start.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return pass(res, 'method not allowed');

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    // Deployed without the env var. Say so in the logs, wave the lead through.
    console.error('[validate] GROQ_API_KEY is not set');
    return pass(res, 'validator unconfigured');
  }

  // Vercel parses JSON bodies for us, but a hand-rolled POST may arrive raw.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return pass(res, 'unreadable body'); }
  }
  if (!body || typeof body !== 'object') return pass(res, 'unreadable body');

  const q = body.q === 'since' ? 'Q_SINCE' : 'Q_AREA';
  const text = String(body.text == null ? '' : body.text).slice(0, MAX_CHARS).trim();
  if (!text) return res.status(200).json({ valid: false, reason: 'empty' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 300,              // reasoning tokens count against this
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user',   content: q + '\nAnswer: ' + text }
        ]
      })
    });

    if (!r.ok) {
      console.error('[validate] groq http ' + r.status);
      return pass(res, 'validator unavailable');
    }

    const data = await r.json();
    const raw = data && data.choices && data.choices[0] &&
                data.choices[0].message && data.choices[0].message.content;
    if (!raw) return pass(res, 'empty completion');

    let out;
    try { out = JSON.parse(raw); } catch (e) { return pass(res, 'unparseable verdict'); }
    if (typeof out.valid !== 'boolean') return pass(res, 'no verdict');

    return res.status(200).json({
      valid: out.valid,
      reason: String(out.reason || '').slice(0, 60)
    });
  } catch (err) {
    // Timeout, DNS, network — all indistinguishable from here, all a pass.
    console.error('[validate] ' + (err && err.name === 'AbortError' ? 'timeout' : String(err)));
    return pass(res, 'validator unavailable');
  } finally {
    clearTimeout(timer);
  }
};
