# Knowledge-capture archiving agent

This document defines the hand-off from a capture issue created by the extension to a local Git knowledge base. It is deliberately source-first: the capture issue is the durable record of user intent, and any article body remains optional.

## Accepted issue input

An eligible issue has a `## Knowledge capture source` section (or an equivalent structured `source` object) containing:

| Field | Required | Handling |
| --- | --- | --- |
| `URL` | Yes | Canonical source link; keep it in the archived note. |
| `Title` | Yes | Use for the note title after sanitising a filename. |
| `Site` | Yes | Record as source context; do not treat it as a category. |
| `Captured at` | Yes | Preserve as an ISO-8601 capture timestamp. |
| `Capture mode` | Yes | `link` is metadata-only; `snapshot` may be summarised, subject to the user's explicit confirmation already recorded by the extension. |
| `User note` | No | Treat as the user's intended angle; retain it separately from factual summary. |
| `Page-text snapshot` | No | Input material, not a license to publish a verbatim copy. |

Reject or request clarification when the URL is absent or malformed, the issue is not a knowledge capture, or the requested archive destination is unclear. Never recover a page body, cookie, credential, or other browser data that was not included in the issue.

## Processing contract

1. Read the capture fields and, when possible, the linked source. State any access limitation rather than guessing.
2. Deduplicate by canonical URL first, then by a normalised title within the knowledge base. If a matching note exists, update it only when the new capture adds material information; otherwise report the existing path and make no content commit.
3. Write a concise Markdown note with source URL, capture timestamp, capture mode, user note (if present), neutral summary, and tags/category. Clearly distinguish source facts, user commentary, and the agent's synthesis.
4. Put an unclassified capture in `00-Inbox/`; place it in another PARA directory only when the subject makes that classification clear. Do not delete or overwrite an existing note during deduplication.
5. Validate the change, commit it with the capture issue identifier in the commit subject, and record the commit SHA in the capture issue.

## Required issue reply

Reply on the capture issue with:

```text
Archived: `relative/path/to/note.md`
Category: Inbox | Project | Area | Resource | Archive
Summary: <one or two sentences>
Duplicate check: new note | updated <path> | existing <path>, no change
Git: <full commit SHA> (`ROO-123: archive …`)
Source: <canonical URL>; mode=<link|snapshot>
```

The commit subject and archived note must both contain the issue identifier. This makes the issue, Git history, and the note mutually traceable without storing secrets or unapproved page content.

## End-to-end fixture

The M3 validation uses a link-mode capture. It therefore proves the default privacy-preserving path: only URL and metadata flow from the extension into the issue; no article body is created or uploaded.
