/**
 * Raw Query Middleware
 * 
 * Captures the raw query string from the URL before any parsing/decoding by Express
 * This is critical for Billplz signature verification which signs the raw, unparsed query string
 */

/**
 * Middleware to capture the raw query string
 * Must be mounted before any query parsers
 */
function rawQueryGrabber(req, res, next) {
  // Find the position of the '?' character that separates path from query
  const idx = req.originalUrl.indexOf('?');
  
  if (idx === -1) {
    // No query string present
    req.rawQuery = '';
  } else {
    // Extract everything after the '?'
    req.rawQuery = req.originalUrl.slice(idx + 1);
  }
  
  // Do NOT decode the query string - preserve exactly as received
  // This is crucial for proper signature verification
  
  // Continue to next middleware
  next();
}

module.exports = rawQueryGrabber;