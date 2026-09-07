# V2EX API 2.0 reference

Base URL: `https://www.v2ex.com/api/v2/`

Use `Authorization: Bearer <Personal Access Token>` for every request. Tokens are credentials: keep them only in a configured secret store or authenticated runtime, and never write them to captures, issues, notes, commits, tests, or logs.

## Read-only capture endpoints

| Endpoint | Purpose | Parameters |
| --- | --- | --- |
| `GET topics/<topic_id>` | Retrieve one topic | none |
| `GET topics/<topic_id>/replies` | Retrieve one topic's replies | `p` (default `1`) |
| `GET nodes/<node_name>` | Retrieve one node | none |
| `GET nodes/<node_name>/topics` | Retrieve topics in one node | `p` (default `1`) |
| `GET topics/latest` | Retrieve the latest site topics | `p` (default `1`) |

Use endpoint paths relative to the base URL. Encode dynamic path values, and validate that topic IDs are decimal digits before building a topic endpoint.

## Boundaries

- Do not call `POST`, `PUT`, or `DELETE` endpoints while collecting knowledge.
- Fetch replies only for an explicit user request; topic captures deliberately omit them by default.
- Fetch only the requested page of a listing unless the user specifically requests pagination. Avoid broad crawls.
- The documented default IP limit is 600 requests per hour. Read `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, and `X-Rate-Limit-Reset` response headers and stop on exhaustion.

## Failure handling

| Situation | Action |
| --- | --- |
| Missing credential | Use the capture's link or already-confirmed snapshot; explain that API retrieval was unavailable. |
| `401` or `403` | Do not retry with changed credentials; report that the configured token lacks access or is invalid. |
| `404` | Preserve the submitted canonical URL and report that the API did not return the resource. |
| `429` or no remaining quota | Stop requests and report the reset time when supplied. |
| Unknown JSON fields | Retain only clearly understood source fields; do not infer a schema. |
