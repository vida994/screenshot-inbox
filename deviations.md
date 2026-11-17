# Implementation decisions

## November 17, 2026 · Initial version

- The discussion proposed a Mac inbox and a Codex skill but did not specify a transfer protocol. Chose a raw authenticated HTTP upload on a trusted local network because it works with native Shortcuts and needs no hosted service or dependencies. Plain HTTP and the trusted-network limit are explicit in the README.
- The proposed skill could otherwise require an absolute checkout path. Kept its retrieval helper self-contained and installed a copy in the standard user skill directory. Receiver and skill share this helper's source in the checkout.
- Kept the receiver in a foreground terminal instead of installing a persistent service. The first version's lifecycle stays visible and reversible.
- The initial version accepts one PNG/JPEG at a time. It does not add format conversion, app selection, image history UI or automatic chat injection.
- Skill validation initially lacked the host Python's `yaml` package. Used an isolated temporary `uv` environment for the validator instead of adding a runtime dependency to the product.
