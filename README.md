# Node TypeScript Template

A template repository for a bare-bones typescript node project with my linter and githooks of choice.

## Prerequisites:
- [Node](https://nodejs.org/en) v22 or greater.
- [PNPM](https://pnpm.io/installation)

## Usage:

From your local machine, and using the github cli you create a repo from this template by running

```sh
gh repo create my-project --template andrewangelle/ts-template-node --public --clone
```

Next navigate to the directory of the project newly created

```sh
cd ./my-project
```

Install dependencies and verify scripts are running:

```sh
pnpm i && pnpm start
```