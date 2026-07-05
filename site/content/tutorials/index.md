---
title: Tutorials
description: Short tiny.md tutorials for the core workflows.
---

# Tutorials

These short tutorials cover the workflows you will use most often.

## Add a page

Create a folder in `site/content/` and add an `index.md` file:

```txt
site/content/notes/index.md
```

Write the page:

```md
# Notes

This is my notes page.
```

Link to it from `site/site.md`:

```md
## Navigation

- [Home](/)
- [Notes](/notes)
```

Run `npm run build`. The page builds to `dist/notes/index.html`.

## Add an image

Put the image beside the page that uses it:

```txt
site/content/notes/
  index.md
  diagram.png
```

Reference it with normal Markdown:

```md
![Diagram](diagram.png)
```

tiny.md copies the image to the matching output folder.

## Customize the design

Edit `site/theme/style.css`.

```css
:root {
  --color-primary: #0f766e;
  --color-page: #ffffff;
}

.content-container {
  max-width: 64ch;
}
```

Default styles load first. Your theme CSS loads second, so small overrides are enough.

## Add a video

Paste a YouTube URL on its own line:

```md
https://www.youtube.com/watch?v=jNQXAC9IVRw
```

tiny.md turns standalone YouTube links into responsive embeds.

[Back to quickstart](/quickstart)
