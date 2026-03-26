const express = require('express');
const router = express.Router();
const { scrapeWebsite } = require('../services/scrapeService');

// POST /api/scraper/scrape — standalone URL scraper
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    const result = await scrapeWebsite(url);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
