## 2024-03-04 - Missing ARIA Labels on Search Inputs
**Learning:** Found that custom search input fields in the application (`WaypointSearch` and `LocationSelector`) were missing `aria-label`s, which are crucial for screen reader users to understand the purpose of the input.
**Action:** Always verify that all input fields, especially custom ones without explicit `<label>` tags, have descriptive `aria-label` attributes to ensure accessibility.
