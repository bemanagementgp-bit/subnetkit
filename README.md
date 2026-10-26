# SubnetKit – IP Subnet Calculator

Free, static IP subnet calculator for network engineers and CCNA students. Pure HTML/CSS/JS – no build step, no dependencies, no backend. Deployed as-is to Vercel.

**Live URL:** https://__SITE_URL__/ (placeholder – replaced after first deploy)

## Features

Free
- **IPv4 subnet** – IP + prefix select / mask select / free text (`192.168.1.10/24`, `192.168.1.10 255.255.255.0`, wildcard `0.0.0.255`). Network, broadcast, first/last usable host, usable hosts (/31 = 2, /32 = 1), total addresses, mask, wildcard, class, address type (RFC 1918, loopback, link-local, CGNAT, multicast, documentation, public), binary with highlighted network bits, hex, integer, reverse DNS.
- **Split into subnets** by new prefix or number of subnets (first 64 rows free).
- **VLSM** – up to 5 networks, descending allocation, optional /31 point-to-point links, waste and efficiency summary.
- **IPv6** – compressed/expanded forms, network, first/last, total addresses (BigInt + power of two), address type, ip6.arpa reverse DNS, binary of first 64 bits, split sub-panel.
- **CIDR ↔ Range** – CIDR → range, range → minimal CIDR list, "is IP in subnet?" checker, reference table /0–/32.
- Copy results, share link (inputs in query string), copy any table as CSV, localStorage persistence, dark/light theme.
- SEO content (CIDR, masks vs wildcards, VLSM, IPv6, cheat sheet, CCNA tips) + FAQ with JSON-LD `WebApplication` and `FAQPage`.

Pro (gated with `isPro()`, one-time licence)
- Unlimited VLSM networks (free: 5)
- Supernet / route summarisation tool (merge adjacent and contained CIDRs)
- Download CSV for every table
- Saved projects (free: 1) – all inputs across tabs, load/delete
- Printable subnet plan for VLSM and split tables (print stylesheet + `window.print()`)

## Local run

```bash
npx serve .
```

Then open the printed URL (e.g. http://localhost:3000). `cleanUrls` means `/privacy` and `/terms` work without `.html` on Vercel; `serve` handles that too.

## Monetization setup

All switches live in `config.js`:

1. **AdSense** – set `ADSENSE_CLIENT` to your `ca-pub-…` id. Ad slots (`.ad-slot[data-slot]`) render real units; until then they show a dashed placeholder.
2. **Pro checkout** – create a product on Lemon Squeezy / Gumroad / Stripe Payment Links and paste the URL into `PRO_CHECKOUT_URL`. Set `PRO_PRICE` to match. Buyers paste the licence key from their receipt into the Pro modal (`activateLicense` in `monetize.js` is a simple length check – wire it to your provider's licence API before going live).
3. **Google Analytics** – set `GA_ID` (`G-XXXXXXX`). Events tracked: `calculate`, `copy`, `share`, `download`, `print`, `project_save`, `vlsm_calc`, `supernet_run`, `pro_click`, `begin_checkout`, `affiliate_click`.
4. **Recommended course** – fill `AFFILIATE_LINKS.course` with `{ name, url }` (e.g. a CCNA course). The card renders in the sidebar only when `url` is non-empty. Links use `rel="sponsored noopener"`.

After the first deploy, replace the `__SITE_URL__` placeholder in `index.html`, `privacy.html`, `terms.html`, `robots.txt`, `sitemap.xml` and `config.js` with the real domain (e.g. `sed -i 's/__SITE_URL__/subnetkit.vercel.app/g' *.html *.txt *.xml *.js`).

## Files

```
index.html      main tool page (SEO-complete, 5 tool tabs)
styles.css      shared base.css + app styles (tabs, mono, binary highlight, print plan)
app.js          all subnet math (window.SubnetMath) + UI
monetize.js     shared theme / toast / GA / AdSense / Pro helpers (do not edit per app)
config.js       window.APP_CONFIG
privacy.html    privacy policy (AdSense requirement)
terms.html      terms of use
robots.txt, sitemap.xml, vercel.json, favicon.svg
```

## Math notes

- IPv4 addresses are handled as unsigned 32-bit integers; masks via `(0xFFFFFFFF << (32 - p)) >>> 0`.
- Range → CIDR uses the classic greedy algorithm (largest aligned block that fits), also used for aggregation after merging overlapping/adjacent ranges.
- VLSM sorts requests by hosts descending and allocates `2^ceil(log2(hosts + 2))` addresses each (or /31 when enabled for exactly 2 hosts).
- IPv6 uses `BigInt` (128-bit) for all address math; compression follows RFC 5952.
