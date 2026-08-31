# Becky

The shared digital handbook for **Becky** (the houseboat), **Cormorant** (the boat garden), and **Drakar** (the runaround boat).

## Product direction

The finished site will give both families:

- a searchable library of digitised manuals and practical guides;
- a map of moorings, pubs, cafés, shops, and other useful places;
- simple forms for adding or updating information without editing code;
- a private AI assistant that answers from the shared knowledge base and cites its sources;
- family-only administration for uploads and changes.

## Proposed data model

- **Guides:** family-authored instructions, safety notes, and checklists.
- **Documents:** uploaded PDFs and manual metadata, with file bytes in object storage.
- **Places:** named map points with category, coordinates, notes, links, and access details.
- **Assets:** Becky, Cormorant, or Drakar, used to organise and filter content.
- **AI sources:** documents and published guides indexed for retrieval, tagged by asset and content type.

Structured records will use the site's database; uploaded manuals and images will use object storage. The AI layer will use OpenAI vector-store retrieval so answers can quote the relevant source and link back to it.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Repository publishing

This checkout is configured with the secondary account's commit email. After creating an empty GitHub repository, add its remote through the SSH alias defined in `~/.ssh/config`:

```bash
git remote add origin git@github-secondary:YOUR_USERNAME/becky.git
git push -u origin main
```

Do not replace `github-secondary` with `github.com`; the alias selects the intended SSH identity.
