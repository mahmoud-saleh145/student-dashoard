# R2 CORS for lecture video uploads

Lecture videos go **browser → R2 directly**, using the presigned PUT that
`POST /videos/uploads/init` returns. That upload is cross-origin, so the bucket
needs a CORS rule naming the dashboard's origin. Without it the browser's
preflight fails and **no bytes move at all** — the dashboard shows
"The upload could not reach storage. Check the connection, or the bucket's CORS
rule for this site."

## Which bucket, exactly

Traced rather than assumed, because a rule on the wrong bucket looks identical
to no rule at all:

    videos.service.ts   initUpload()     -> presignUpload({ bucket: 'uploads', ... })
    storage.service.ts  bucketName()     -> this.cfg.buckets.uploads
    configuration.ts    buckets.uploads  -> process.env.R2_BUCKET_UPLOADS ?? 'edu-uploads-dev'
    backend .env        R2_BUCKET_UPLOADS = edu-uploads

So the rule goes on **`edu-uploads`**. Object keys land under
`source/videos/<videoId>/<uuid>.<ext>`.

The other two buckets need no CORS: `edu-media` is read through the Worker, and
library documents are written server-side by the API. Note that
`R2_BUCKET_LIBRARY` is still unset, so library documents currently fall back
into `edu-uploads` as well. That does not change this rule — those uploads
never touch a browser — but it is why the separate library bucket is still on
the production checklist.

## Why direct, when library documents go through the API

A library document is capped at 200 MB and is proxied through
`/api/upload/library-document`, which needs no CORS. A lecture is capped at
8 GB. Proxying that would hold a socket open on the Next server and the API for
the length of the upload, and one slow uploader would occupy a worker for
minutes. `videos.service.ts` puts it the same way from the other side:

> A 2 GB lecture streamed through Node would pin a worker for minutes and cap
> concurrent uploads at one per process.

So the two paths differ deliberately, and the CORS rule is the price of the
video one.

## The rule

Cloudflare dashboard → R2 → **edu-uploads** → **Settings** → **CORS Policy** →
Edit, or:

```
wrangler r2 bucket cors put edu-uploads --file docs/r2-cors.json
```

```json
[
  {
    "AllowedOrigins": ["https://student-dashoard.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Each field, and why it is exactly this:

- **`AllowedOrigins`** — exactly `https://student-dashoard.vercel.app`, and
  nothing else. Scheme included, no trailing slash, no wildcard: a wildcard
  would let any site spend a leaked signature. It must match `APP_ORIGIN` in
  the dashboard's production environment character for character, including the
  spelling of the subdomain — the origin is compared as a string, so a rule
  written for `student-dashboard` fails silently against a site served from
  `student-dashoard`.

  Vercel preview deployments get their own generated origins and are therefore
  **not** covered. Uploading from a preview URL fails at the preflight; that is
  the trade-off for keeping the list to one entry. Local development
  (`http://localhost:3001`) is not covered either — add it as a second entry
  only if uploads need to work from `npm run dev`.
- **`AllowedMethods`** — `PUT` only. The browser never reads from this bucket:
  sources are private and students stream the HLS output through the Worker, so
  `GET` would grant something the product does not use.
- **`AllowedHeaders`** — `content-type` only. The presigned URL is signed over
  the Content-Type, so the browser must send exactly the header `init`
  returned, and `upload.ts` sends nothing else on purpose: any extra header is
  outside the signature and R2 refuses the request.
- **`ExposeHeaders`** — `ETag` is not required by the current code (the API
  verifies the object by asking storage for its size, not by trusting a header
  the client reports). It is here because it costs nothing and is what any
  future resumable/multipart upload would need.
- **`MaxAgeSeconds`** — how long a browser may cache the preflight. An hour
  means one OPTIONS per session rather than one per upload.

## This does not make the bucket public

A CORS rule says which origins a *browser* may send a request from. It grants
no access on its own: every request still needs the presigned signature, which
is issued only to a signed-in staff account, is scoped to one object key, and
expires in six hours. Leave R2 public access **off** and do not attach an
`r2.dev` domain to this bucket.

## Checking it worked

After saving the rule, in the dashboard: a course → **Content** → a lecture →
**Add video**. A file that reaches "Queued for processing" has been through the
preflight and the PUT.

If it fails at the preflight instead, the browser console names the reason and
it is almost always one of:

- the origin in the rule does not match the dashboard's exactly (`http` vs
  `https`, a port, a trailing slash),
- the rule is on the wrong bucket — it belongs on **edu-uploads**, not
  `edu-media`,
- the rule was saved less than a minute ago and the old preflight is still
  cached; a hard reload clears it.

A 403 on the PUT itself, rather than a preflight failure, is a different
problem: the signature expired (six hours) or `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` do not grant write on that bucket.
