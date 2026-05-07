'use strict';

/**
 * Analyze what a lead is missing and pick the best offer + pitch angle.
 *
 * Priority logic:
 *   1. No AI receptionist            → sam_ai
 *   2. Has AI recept, bad/no website → website
 *   3. Has AI recept, ok site, <50 reviews → reviews
 *   4. Has AI recept, good site, ok reviews → google_ads
 */

const BAD_PLATFORMS = ['Wix', 'Squarespace', 'Weebly', 'GoDaddy'];

function analyzeGaps(lead, enrichment) {
  const tools   = enrichment?.detected_tools || {};
  const reviews = lead.review_count || 0;
  const hasWebsite     = !!lead.website_live;
  const hasBadPlatform = BAD_PLATFORMS.includes(enrichment?.tech_stack);
  const hasAiRecept    = !!tools.ai_receptionist;
  const hasReviewPlatform = !!tools.review_platform;

  // Build gap list (used for display)
  const gaps = [];
  if (!hasAiRecept)                              gaps.push('no_ai_followup');
  if (!hasWebsite)                               gaps.push('no_website');
  if (hasBadPlatform)                            gaps.push('bad_website_platform');
  if (!enrichment?.has_contact_form)             gaps.push('no_contact_form');
  if (reviews < 25)                              gaps.push('low_reviews');
  if (enrichment?.google_ads && !hasAiRecept)    gaps.push('paying_for_ads_no_followup');

  let recommended_offer, pitch_angle, confidence;

  // ── No AI receptionist → Sam AI is the pitch ──────────────────
  if (!hasAiRecept) {
    recommended_offer = 'sam_ai';
    confidence = 'high';

    if (enrichment?.google_ads) {
      pitch_angle = `Running Google Ads with no AI follow-up — paying for clicks they're losing after hours when nobody picks up.`;
    } else if (!hasWebsite) {
      pitch_angle = `No website and no AI follow-up. Leads come in by word of mouth, call once, get voicemail, and call the next contractor.`;
    } else if (!enrichment?.has_contact_form) {
      pitch_angle = `No contact form on their site — leads who can't reach them in under 60 seconds move on to the next result.`;
    } else if (reviews < 25) {
      pitch_angle = `Only ${reviews} Google reviews and no AI follow-up. Faster-responding competitors with more reviews are winning every quote request.`;
    } else if (hasReviewPlatform) {
      pitch_angle = `Has ${tools.review_platform} for reviews but no AI follow-up on new leads — the hole is at the top of the funnel, not the bottom.`;
    } else {
      pitch_angle = `Established contractor with ${reviews} reviews and no automated lead response — leaving off-hours revenue on the table every week.`;
    }

  // ── Has AI receptionist → pivot offer based on next biggest gap ─
  } else {
    // 2. Bad or no website
    if (!hasWebsite || hasBadPlatform) {
      recommended_offer = 'website';
      confidence = 'high';
      const platform = !hasWebsite ? 'no website' : enrichment?.tech_stack;
      pitch_angle = `Has ${tools.ai_receptionist} for lead response but ${platform === 'no website' ? 'no website at all' : `website is on ${platform}`} — leads check them out online before calling and bounce immediately.`;

    // 3. Ok site but low reviews
    } else if (reviews < 50) {
      recommended_offer = 'reviews';
      confidence = 'high';
      pitch_angle = `Has ${tools.ai_receptionist} and a decent site, but only ${reviews} Google reviews — losing the listing to competitors with 5–10x more social proof.`;

    // 4. Everything ok → Google Ads
    } else {
      recommended_offer = 'google_ads';
      confidence = 'medium';
      pitch_angle = `Has ${tools.ai_receptionist}, a solid website, and ${reviews} reviews — the system is ready but they need more top-of-funnel traffic. Google Ads would fill the pipeline.`;
    }
  }

  return { gaps, recommended_offer, pitch_angle, confidence, detected_tools: tools };
}

module.exports = { analyzeGaps };
