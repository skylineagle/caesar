# URL Filters Test Guide

This guide helps verify that the nuqs-based URL filter implementation works correctly.

## Review Page (/review) Filter Tests

### Test 1: Camera Filter

1. Navigate to `/review`
2. Click on camera filter and select specific cameras
3. Verify URL shows: `?cameras=camera1,camera2`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 2: Labels Filter

1. Navigate to `/review`
2. Click on general filter and select specific labels
3. Verify URL shows: `?labels=person,car`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 3: Date Filter

1. Navigate to `/review`
2. Click on date filter and select a specific date
3. Verify URL shows: `?after=timestamp&before=timestamp`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 4: Show Reviewed Toggle

1. Navigate to `/review`
2. Toggle "Show Reviewed" switch
3. Verify URL shows: `?showReviewed=true`
4. Refresh page - setting should persist
5. Copy URL and open in new tab - setting should be applied

### Test 5: Severity Filter

1. Navigate to `/review`
2. Switch between Alert/Detection/Motion tabs
3. Verify URL shows: `?severity=alert` or `?severity=detection` or `?severity=significant_motion`
4. Refresh page - severity should persist
5. Copy URL and open in new tab - severity should be applied

### Test 6: Combined Filters

1. Navigate to `/review`
2. Apply multiple filters (cameras + labels + date + severity)
3. Verify URL shows all parameters: `?cameras=cam1&labels=person&severity=alert&after=123&before=456`
4. Refresh page - all filters should persist
5. Copy URL and open in new tab - all filters should be applied

## Explore Page (/explore) Filter Tests

### Test 1: Search Query

1. Navigate to `/explore`
2. Enter search term in search box
3. Verify URL shows: `?query=searchterm`
4. Refresh page - search should persist
5. Copy URL and open in new tab - search should be applied

### Test 2: Camera Filter

1. Navigate to `/explore`
2. Click on camera filter and select specific cameras
3. Verify URL shows: `?cameras=camera1,camera2`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 3: Date Range Filter

1. Navigate to `/explore`
2. Click on date filter and select date range
3. Verify URL shows: `?after=timestamp&before=timestamp`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 4: Advanced Filters

1. Navigate to `/explore`
2. Click "More Filters" and adjust scores, zones, etc.
3. Verify URL shows: `?min_score=0.5&max_score=1.0&zones=zone1`
4. Refresh page - filters should persist
5. Copy URL and open in new tab - filters should be applied

### Test 5: Sort Options

1. Navigate to `/explore`
2. Change sort order (when available)
3. Verify URL shows: `?sort=date_desc`
4. Refresh page - sort should persist
5. Copy URL and open in new tab - sort should be applied

### Test 6: Combined Search Filters

1. Navigate to `/explore`
2. Apply multiple filters (query + cameras + date + scores)
3. Verify URL shows all parameters: `?query=test&cameras=cam1&after=123&min_score=0.5`
4. Refresh page - all filters should persist
5. Copy URL and open in new tab - all filters should be applied

## Browser Navigation Tests

### Test 1: Back/Forward Navigation

1. Navigate to `/review`
2. Apply some filters
3. Navigate to `/explore`
4. Apply different filters
5. Use browser back button - should return to review with original filters
6. Use browser forward button - should return to explore with filters

### Test 2: Direct URL Access

1. Manually type URL with filters: `/review?cameras=cam1,cam2&severity=alert&showReviewed=true`
2. Page should load with all specified filters applied
3. Repeat for explore page: `/explore?query=person&cameras=cam1&after=1234567890`

## Expected Behavior

- ✅ All filter changes should immediately update the URL
- ✅ Page refresh should preserve all filter states
- ✅ Copying and sharing URLs should work with filters
- ✅ Browser back/forward navigation should work correctly
- ✅ Direct URL access with parameters should apply filters
- ✅ Invalid or outdated parameters should be handled gracefully
- ✅ Filter combinations should work together properly

## Common Issues to Check

- [ ] URL parameters are properly encoded/decoded
- [ ] Array parameters (cameras, labels) are handled correctly
- [ ] Timestamp parameters are valid numbers
- [ ] Boolean parameters (showReviewed) work correctly
- [ ] Empty/undefined filters don't add unnecessary URL parameters
- [ ] Filter reset functionality clears URL parameters
- [ ] Multiple filter changes don't create excessive history entries
