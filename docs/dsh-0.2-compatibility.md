# DSH 0.2 compatibility

Version 0.1.5 requires DSH 0.2.1-rc.3 or a compatible host. It uses the serial `agent/created` lifecycle, after Session creation has been announced, and the backend-independent `sessionQuery.readSurface` method. The query service must be mounted by the profile. Earlier `agent/session-start` and `session.events` APIs are no longer used.

Declared DSH dependencies and browser injection packages match the current package inventory. Removed runtime and invariant packages are no longer declared.

Install the fixed commit reachable from the repository main branch through dsh plugin. The shared environment stores full commit ids; local source paths are not portable plugin pins.

The maintenance lockfile disables implicit peer installation and uses the current Cordis and schemastery versions. Git packages build without depending on the source checkout node_modules.
