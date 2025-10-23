# Local Font Download API

This document describes the new API endpoints for downloading and serving Google Fonts locally.

## New API Endpoints

### 1. Download Font Locally

**POST** `/api/fonts/:id/download`

Downloads a specific Google Font to the local server with the specified configuration.

#### Parameters

- `id` (path parameter) - The font ID (e.g., "roboto", "open-sans")

#### Request Body / Query Parameters

You can pass parameters either in the request body (JSON) or as query parameters:

- `subsets` (optional) - Array of font subsets (e.g., `["latin", "latin-ext"]`)
- `variants` (optional) - Array of font variants (e.g., `["regular", "700", "italic"]`)
- `formats` (optional) - Array of font formats (e.g., `["woff2", "woff"]`)

#### Example Requests

**Using JSON body:**
```bash
curl -X POST http://localhost:9000/api/fonts/roboto/download \
  -H "Content-Type: application/json" \
  -d '{
    "subsets": ["latin", "latin-ext"],
    "variants": ["regular", "700"],
    "formats": ["woff2", "woff"]
  }'
```

**Using query parameters:**
```bash
curl -X POST "http://localhost:9000/api/fonts/roboto/download?subsets=latin,latin-ext&variants=regular,700&formats=woff2,woff"
```

#### Response

```json
{
  "id": "roboto",
  "family": "Roboto",
  "localPath": "/api/fonts/roboto/local/a1b2c3d4e5f6",
  "subsets": ["latin", "latin-ext"],
  "variants": ["regular", "700"],
  "formats": ["woff2", "woff"],
  "hash": "a1b2c3d4e5f6",
  "downloadedAt": "2025-10-23T12:34:56.789Z"
}
```

The `hash` is a unique identifier for this specific font configuration, ensuring different configurations of the same font are stored separately.

---

### 2. Serve Local Font Files

**GET** `/api/fonts/:id/local/:hash/:file`

Serves a specific font file or CSS file from the local storage.

#### Parameters

- `id` (path parameter) - The font ID
- `hash` (path parameter) - The configuration hash returned from the download endpoint
- `file` (path parameter) - The file name (e.g., `regular.woff2`, `fonts.css`)

#### Example Requests

**Get the CSS file:**
```bash
curl http://localhost:9000/api/fonts/roboto/local/a1b2c3d4e5f6/fonts.css
```

**Get a specific font file:**
```bash
curl http://localhost:9000/api/fonts/roboto/local/a1b2c3d4e5f6/regular.woff2
```

#### Response

Returns the requested file with appropriate Content-Type headers and long-term caching (1 year).

---

### 3. List Local Fonts

**GET** `/api/fonts/local`

Returns a list of all fonts that have been downloaded locally.

#### Example Request

```bash
curl http://localhost:9000/api/fonts/local
```

#### Response

```json
[
  {
    "id": "roboto",
    "family": "Roboto",
    "hash": "a1b2c3d4e5f6",
    "subsets": ["latin", "latin-ext"],
    "variants": ["regular", "700"],
    "path": "/api/fonts/roboto/local/a1b2c3d4e5f6"
  },
  {
    "id": "open-sans",
    "family": "Open Sans",
    "hash": "b2c3d4e5f6a7",
    "subsets": ["latin"],
    "variants": ["regular", "700", "italic"],
    "path": "/api/fonts/open-sans/local/b2c3d4e5f6a7"
  }
]
```

---

## Usage Example

### Complete Workflow

1. **Download a font:**
```bash
curl -X POST http://localhost:9000/api/fonts/roboto/download \
  -H "Content-Type: application/json" \
  -d '{
    "subsets": ["latin"],
    "variants": ["regular", "700"],
    "formats": ["woff2"]
  }'
```

Response:
```json
{
  "id": "roboto",
  "family": "Roboto",
  "localPath": "/api/fonts/roboto/local/abc123def456",
  "subsets": ["latin"],
  "variants": ["regular", "700"],
  "formats": ["woff2"],
  "hash": "abc123def456",
  "downloadedAt": "2025-10-23T12:34:56.789Z"
}
```

2. **Include the CSS in your HTML:**
```html
<link rel="stylesheet" href="http://localhost:9000/api/fonts/roboto/local/abc123def456/fonts.css">
```

3. **Use the font in your CSS:**
```css
body {
  font-family: 'Roboto', sans-serif;
}
```

---

## Storage Structure

Downloaded fonts are stored in the following directory structure:

```
fonts/
├── roboto/
│   ├── abc123def456/
│   │   ├── fonts.css
│   │   ├── regular.woff2
│   │   └── 700.woff2
│   └── def456abc123/
│       ├── fonts.css
│       ├── regular.woff
│       └── 700.woff
└── open-sans/
    └── xyz789uvw012/
        ├── fonts.css
        ├── regular.woff2
        └── italic.woff2
```

Each font configuration gets its own unique hash directory to prevent conflicts between different configurations of the same font.

---

## Notes

- Downloaded fonts are cached on the server. If a file already exists, it won't be downloaded again.
- The CSS file is automatically generated with proper `@font-face` rules pointing to the local font files.
- Font files are served with long-term caching headers (1 year) for optimal performance.
- The `/fonts` directory is automatically ignored by git (added to `.gitignore`).
