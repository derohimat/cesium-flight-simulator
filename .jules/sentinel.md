## 2024-05-24 - Input Length Limits on External API Calls
**Vulnerability:** User inputs (token configuration and location search) lacked `maxLength` boundaries.
**Learning:** Even safe input types inside React (which escapes HTML) can cause client-side DoS or result in overly large unvalidated payloads being transmitted to third-party endpoints (like Mapbox/Nominatim or local storage).
**Prevention:** Always set explicit `maxLength` limits on `input` elements based on expected maximum logical constraints, especially if that input is subsequently passed into external network calls or persisted on the client.
