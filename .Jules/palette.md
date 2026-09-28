## 2024-03-04 - Missing ARIA Labels on Search Inputs
**Learning:** Found that custom search input fields in the application (`WaypointSearch` and `LocationSelector`) were missing `aria-label`s, which are crucial for screen reader users to understand the purpose of the input.
**Action:** Always verify that all input fields, especially custom ones without explicit `<label>` tags, have descriptive `aria-label` attributes to ensure accessibility.

## 2025-03-05 - Navigation and Safe Defaults in Director Mode
**Learning:** Users need a quick way to preview and navigate directly to a waypoint without starting the entire flight, and Director Mode flights require safe defaults (like auto-altitude) to prevent the camera from crashing into the 3D terrain on automated paths.
**Action:** Added a quick 'Go to waypoint' button (📍) next to each item in the WaypointList for instant camera teleportation, and enforced `handleAutoAltitude` in the flight start sequence to guarantee safe altitude clearance based on the terrain.
