# Development

[← Back to the README](../README.md)

```bash
git clone https://github.com/tplnet/homebridge-heos-multiroom-audio.git
cd homebridge-heos-multiroom-audio
npm install          # also builds the plugin
npm run lint
npm test             # builds and runs the unit tests (no device needed)
npm run smoke        # compatibility smoke test with simulated devices
npm run check        # everything: audit, lint, tests, smoke test
npm run watch        # starts a local Homebridge with test/hbConfig and rebuilds on change
```

Manual tests with real devices: see [testing.md](testing.md).
Publishing a new version: see [releasing.md](releasing.md).

Run all checks locally with `npm run check` (runtime `npm audit`, lint, unit tests, smoke test). To test another Homebridge version, install it temporarily with `npm install --no-save homebridge@<version>`.

Upstream changes from the original project can be merged with:

```bash
git remote add upstream https://github.com/hov3rcraft/homebridge-denon-heos-audio.git
git fetch upstream && git merge upstream/main
```

## Protocol specifications

- [AVR Control protocol specification](https://assets.denon.com/documentmaster/uk/avr1713_avr1613_protocol_v860.pdf)
- [HEOS CLI protocol specification](https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf)
