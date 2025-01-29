# OmniPR: Unified pull request creation.

OmniPR is a lightweight library that provides a unified API for interacting with popular Git providers like **GitHub**,
**GitLab**, and **Bitbucket**. Whether you're committing files to a branch or creating pull requests, OmniPR simplifies
these operations with a consistent interface, regardless of the provider.

## Why OmniPR?

### Unified and lightweight

OmniPR does not rely on any official or unofficial SDKs provided by Git providers. Instead, it uses **direct HTTP REST
API requests**. This approach keeps the library size minimal while ensuring a seamless and uniform experience across all
supported providers.

### One interface for all providers

The core of OmniPR is the concept of **GitProviders**. Each GitProvider implements the same public interface, allowing
you to interact with any provider without needing to learn different APIs. Whether you switch between GitHub, GitLab, or
Bitbucket, your code stays the same.

Each provider implements the same interface. To explore available methods, refer to
the [API Documentation](#api-documentation).

## Supported git providers

- **GitHub**
- **GitLab**
- **Bitbucket**

## Features

- **Simple**: Package focuses on one particualr thing, not trying to solve all Git features.
- **Unified API**: Perform Git operations like committing files and creating pull requests with a single, consistent
  interface.
- **Provider Agnostic**: Works with GitHub, GitLab, and Bitbucket (and potentially other providers) without requiring
  specific SDKs.
- **Lightweight**: Designed for efficiency, using raw HTTP REST API calls to avoid unnecessary overhead.
