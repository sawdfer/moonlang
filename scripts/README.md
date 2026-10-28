# scripts

## Local toolchain

Node.js lives inside the project, in `.tooling/` (ignored by Git). Nothing is installed on the operating system.

Activate it in each new terminal:

```sh
source scripts/env.sh
node --version
pnpm --version
```

To remove everything, delete the `.tooling/` folder.

### Setting up `.tooling/` on a new machine

1. Download the official Node.js 24 LTS archive for your platform from https://nodejs.org/dist/ together with `SHASUMS256.txt`.
2. Check it: `grep " <file>$" SHASUMS256.txt | shasum -a 256 -c -`
3. Extract it into `.tooling/node` (`tar -xJf <file> -C .tooling/node --strip-components=1`).
4. Run `source scripts/env.sh && corepack enable --install-directory .tooling/bin pnpm`.
