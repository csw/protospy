# Conformance tests

## Overview

The most fundamental requirement for protospy is that it is a correct HTTP reverse proxy; it must be able to be transparently dropped in between services. To validate this, we have a standalone end-to-end HTTP reverse proxy conformance test suite in `conformance/`.

To ensure that the conformance tests and protospy don't co-deviate from correct HTTP behavior, they use well-known HTTP reverse proxies as reference targets. These are currently Caddy and HAProxy. Any deviation from their behavior (aside from specifically defined quirks) will therefore be detected.

## Tested functionality

See [conformance-test-catalog.md](conformance-test-catalog.md) for the specific proxy behaviors covered by the test suite.

## Policy

TODO

## Components

### GoodServer

### WireServer

### httpx tests for conformant HTTP interactions

### h11 tests for HTTP misbehavior and low-level control

## Usage modes

TODO: ephemeral instances as well as intended preexisting targets
