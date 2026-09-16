Expo Go loading repair

Recovered the 13 published source files from the original Snack download. The original dependency metadata omitted handles; Expo runtime therefore used the legacy unversioned bundle address shown in the screenshot. Added versioned handles following expo/snack cache-busting.ts, resolveDependencies.ts and fetchBundle.ts. All source code and package versions are unchanged.

This corrects the address construction, but availability of these prebuilt bundles remains unverified: the Snack bundler CDN returned HTTP 403 in this environment. No device or camera test has been performed. Do not describe this as a verified working build.

JavaScript launch repair

The next device error was a TypeScript parse failure at model.ts Database.version literal type. Compiled all 13 local source files and JSX into a single ES2018 App.js using esbuild, retaining external Expo packages and their corrected handles. Parsed the entire emitted file with Acorn with no TypeScript or JSX plugins. Checked external imports against published dependency declarations. Also parsed both embedded WebView scripts. No new device verification has been performed.
