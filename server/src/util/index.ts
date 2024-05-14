import * as url from "node:url";
import * as LSP from "vscode-languageserver";


export const uriToPath = url.fileURLToPath;

export function pathToUri(filePath: string): LSP.URI {
    const uri = url.pathToFileURL(filePath).href;

    // Note: LSP sends us file uris containing '%3A' instead of ':', but
    // the node pathToFileURL uses ':' anyways. Manually fix this here.
    // This is a bit hacky but we should ideally only be working with the URIs from LSP anyways.
    return uri.slice(0, 5) + uri.slice(5).replace(":", "%3A");
}
