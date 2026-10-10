import {cp,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const destination=new URL('public/pdfjs/',root);
await mkdir(destination,{recursive:true});
for(const folder of ['cmaps','standard_fonts','wasm','iccs']) {
  await cp(new URL(`node_modules/pdfjs-dist/${folder}`,root),new URL(folder,destination),{recursive:true});
}
await cp(new URL('node_modules/pdfjs-dist/LICENSE',root),new URL('LICENSE.txt',destination));
