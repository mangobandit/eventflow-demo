# Repository Guard Hooks

Git does not transfer repository hooks to new clones or run remote hook code
when someone clones a repository. That is an intentional Git security boundary.

This directory contains an opt-in local hook template for trusted checkouts:

```bash
git config core.hooksPath .githooks
```

The `post-checkout` hook prints the repository notice and opens:

https://www.youtube.com/watch?v=ueufxzUjsS0

It is a notice mechanism, not a substitute for private repositories, hosting
permissions, branch protection, secret scanning, or legal enforcement.
