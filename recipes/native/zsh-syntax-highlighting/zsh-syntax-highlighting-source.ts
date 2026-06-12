import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/zsh-users/zsh-syntax-highlighting/archive/1d85c692615a25fe2293bdd44b34c217d5d2bf04.tar.gz",
  hash: "db80b1199aa0586756879d7bda9ef9e1e2fa99b97aafaa7d95807c0d47f2a084",
});

export const zshSyntaxHighlightingSourceRecipe = recipe;
