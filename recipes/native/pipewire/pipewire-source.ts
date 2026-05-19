import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/pipewire/pipewire/-/archive/1.4.7/pipewire-1.4.7.tar.gz",
  hash: "08112f72c8139c803135075672ed3501278df61016a713f8bd6ea3cb0c47d412",
});

export const pipewireSourceRecipe = recipe;
