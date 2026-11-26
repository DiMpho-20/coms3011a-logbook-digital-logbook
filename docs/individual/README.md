# Individual implementations

This folder records what each group member built and can defend as their own
work, separately from the team-wide documentation in `docs/`.

## How it is organised

```text
docs/individual/
└── <member>/
    ├── README.md                  who they are, what they owned, evidence index
    └── <feature>/
        ├── README.md              the problem, the design, how it works, proof
        ├── demo-script.md         steps to show the feature live
        ├── report-notes.md        talking points, limitations, likely questions
        └── screenshots/           captures referenced by the documents above
```

One folder per feature the member owned. A feature folder holds evidence, not
prose: commit hashes, file paths, test names and screenshots that can be
checked in a minute.

## Rules

- Every claim points at something verifiable: a commit, a file, a test, or a
  screenshot taken from the deployed or local app.
- Use full commit hashes in prose where space allows; short hashes are fine in
  tables.
- No secrets: no connection strings, API keys or personal data in screenshots.
- Documentation in English, present tense, no marketing language.

## Members

| Member | Feature folder | Summary |
| --- | --- | --- |
| Dineo Motloung | [`dineo/database-migrations/`](dineo/database-migrations/README.md) | Prisma migration workflow: baseline squash, deploy-time migrations, direct-connection migrations, CI databases, and the migration-backed features authored on top of it |
