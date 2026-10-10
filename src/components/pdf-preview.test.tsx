import {act,render,screen,waitFor,fireEvent} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import PdfPreview from "./pdf-preview";
const pdf=vi.hoisted(()=>({getDocument:vi.fn(),getPage:vi.fn(),destroy:vi.fn(),cancel:vi.fn()}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs",()=>({GlobalWorkerOptions:{workerSrc:""},getDocument:pdf.getDocument}));
const dataUrl="data:application/pdf;base64,JVBERi0=";
beforeEach(()=>{
  vi.resetAllMocks();pdf.destroy.mockResolvedValue(undefined);
  pdf.getPage.mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:480*scale,height:320*scale}),render:()=>({promise:Promise.resolve(),cancel:pdf.cancel})});
  pdf.getDocument.mockReturnValue({promise:Promise.resolve({numPages:2,getPage:pdf.getPage}),destroy:pdf.destroy});
});
it("renders pages locally, navigates and releases the document on close",async()=>{
  const view=render(<PdfPreview dataUrl={dataUrl}/>);
  await waitFor(()=>expect(pdf.getPage).toHaveBeenCalledWith(1));
  expect(pdf.getDocument).toHaveBeenCalledWith(expect.objectContaining({data:expect.any(Uint8Array),cMapUrl:"/pdfjs/cmaps/",wasmUrl:"/pdfjs/wasm/"}));
  expect(screen.getByRole("button",{name:"Previous page"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Next page"}));await waitFor(()=>expect(pdf.getPage).toHaveBeenCalledWith(2));
  expect(screen.getByRole("button",{name:"Next page"})).toBeDisabled();expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  view.unmount();expect(pdf.destroy).toHaveBeenCalled();expect(pdf.cancel).toHaveBeenCalled();
});
it("explains corrupt PDF errors instead of leaving the loading state",async()=>{
  pdf.getDocument.mockImplementation(()=>({promise:Promise.reject(new Error("Invalid PDF")),destroy:pdf.destroy}));
  render(<PdfPreview dataUrl={dataUrl}/>);expect(await screen.findByRole("alert")).toHaveTextContent("This PDF could not be displayed.");expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("stops password-protected documents without requesting or retaining a password",async()=>{
  let task:{promise:Promise<never>;destroy:typeof pdf.destroy;onPassword?:()=>void};
  pdf.getDocument.mockImplementation(()=>task={promise:new Promise(()=>{}),destroy:pdf.destroy});
  render(<PdfPreview dataUrl={dataUrl}/>);await waitFor(()=>expect(task!.onPassword).toBeTypeOf("function"));
  act(()=>task!.onPassword!());
  expect(await screen.findByRole("alert")).toHaveTextContent("This PDF requires a password.");expect(pdf.destroy).toHaveBeenCalled();
});
