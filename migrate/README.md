# Ghost → Hugo Migration

## Steps

1. **Export from Ghost**
   - Go to your Ghost admin panel
   - Navigate to: Settings → Labs → Export your content
   - Download the `.json` file

2. **Install dependencies**
   ```bash
   cd migrate
   npm install
   ```

3. **Run the migration**
   ```bash
   node migrate.js --input your-ghost-export.json --output ../site/content --images ../site/static/images
   ```

4. **Download images**
   The script will tell you which images need to be downloaded from your Ghost site.
   Copy them to `site/static/images/`.

5. **Verify**
   ```bash
   cd ../site
   hugo server
   ```
   Open http://localhost:1313 and check that all posts look correct.

## What gets migrated

- ✅ Post titles, slugs, dates
- ✅ Tags
- ✅ Draft status
- ✅ HTML content → Markdown
- ✅ Ghost bookmark cards
- ✅ Ghost image cards
- ✅ Image path rewriting
- ✅ Pages (like Connect)
- ✅ Custom excerpts / meta descriptions
