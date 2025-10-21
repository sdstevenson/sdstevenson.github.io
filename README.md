Stugs — Minimal website for GitHub Pages

This repository contains a single-page site you can host on GitHub Pages. It's intentionally tiny: `index.html` with an About section and a link to a Google Form to collect emails.

Quick steps

1. Create a Google Form
   - Go to https://forms.google.com and create a new form.
   - Add a question for 'Email' and mark it required.
   - Use the "Send" button, then the link icon to copy a sharable URL.
   - Optional: To embed, click the <> (embed) icon in Send, copy the iframe code.

2. Update `index.html`
   - Open `index.html` and replace the placeholder URL `https://forms.gle/REPLACE_WITH_YOUR_GOOGLE_FORM` with your actual form link.
   - Or, replace the link element with the iframe embed code (inside the `#contact` section).

3. Publish to GitHub Pages
   - Initialize a repo, commit, and push to GitHub, then enable Pages from the repo settings.

PowerShell commands (example)

# from project root
git init
git add .
git commit -m "Initial site for Stugs"
# create a repo on GitHub (use gh CLI or create manually), then add remote and push
# example with GitHub CLI (optional):
# gh repo create stugs_website --public --source=. --remote=origin --push

# if you already added remote 'origin':
git branch -M main
git push -u origin main

After pushing, open the repository on GitHub and enable Pages (usually from the 'main' branch / root). GitHub will publish at https://<your-username>.github.io/<repo-name>/ within a minute or two.

Customization

- Edit the About text in `index.html` (the paragraph with id `about-text`).
- Replace the site title in the HTML <title> and header.

Need help?

If you'd like, I can:
- Create a Google Form for you and add its link/embed to `index.html` (you'll need to provide the questions or allow me to create a basic Email-only form and share the link),
- Or, if you give a GitHub repo URL or grant push access, I can commit and enable Pages for you.

