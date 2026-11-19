# Security policy

## Supported versions

Only the latest released version of `@tplnet/homebridge-heos-multiroom-audio` receives fixes. Please update before reporting.

## How dependencies are checked

- Once a week and on every dependency change the *Compatibility & CVE check* workflow runs `npm audit`: any known vulnerability (CVE / GitHub advisory) in a runtime dependency fails the check; findings in development tools are reported.
- The same workflow starts the plugin with the newest Homebridge release (and the beta) on Node.js 22, 24 and 26, with simulated HEOS and AVR Control devices.
- Dependabot opens update pull requests weekly, security updates immediately. They run all checks and are merged when green.
- Once a week, on every dependency change and before every release the *Malware scan* workflow checks all dependencies against the list of known malicious npm packages (OSV-Scanner) and scans the package and the installed dependencies with ClamAV. Any finding fails the check. Dependencies are installed without running their install scripts (`npm ci --ignore-scripts`).
- A release is only published when the audit and the malware scan are clean and the plugin starts with the newest Homebridge release.

## Reporting a vulnerability

Please do **not** open a public issue. Use *Security* → *Report a vulnerability* in this GitHub repository (private vulnerability reporting).

Please include the affected version, a description and, if possible, steps to reproduce. Reports are handled on a best-effort basis (this is a private hobby project, see the disclaimer in the README); there is no guaranteed response time. Once a fix is released, the issue is published as a GitHub security advisory.

Issues in Homebridge itself belong to [homebridge/homebridge](https://github.com/homebridge/homebridge/security); issues in the firmware of HEOS devices to Denon / Marantz.
