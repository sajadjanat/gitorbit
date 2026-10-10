import {fireEvent,render,screen,within} from "@testing-library/react";
import {expect,it} from "vitest";
import {setLanguage,t} from "@/lib/i18n";
import {type FilePreview} from "@/lib/native";
import {SideBySideDiff} from "./side-by-side-diff";
import {FileContentPreview} from "./media-preview";
const image=(path="photo.png",suffix="base"):FilePreview=>({path,kind:"image",mime:"image/png",size:2048,dataUrl:`data:image/png;base64,${suffix}`,unavailable:null});
it.each(["en","fa","ar","zh"] as const)("shows both actual image versions with shared zoom in %s",language=>{
  setLanguage(language);
  render(<SideBySideDiff text="" staged={false} truncated={false} media={{before:image(),after:image("photo.png","working")}}/>);
  const before=within(screen.getByRole("region",{name:t("Index")})).getByRole("img",{name:"photo.png"});
  const after=within(screen.getByRole("region",{name:t("Working tree")})).getByRole("img",{name:"photo.png"});
  expect(before).toHaveAttribute("src",image().dataUrl);expect(after).toHaveAttribute("src",image("photo.png","working").dataUrl);
  for(const img of [before,after]) {Object.defineProperties(img,{naturalWidth:{value:800},naturalHeight:{value:600}});fireEvent.load(img);}
  expect(screen.getAllByText(/800 × 600/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button",{name:t("Zoom in")}));
  expect(before).toHaveStyle({width:"1000px"});expect(after).toHaveStyle({width:"1000px"});
  fireEvent.click(screen.getByRole("button",{name:t("Fit image")}));expect(before).toHaveStyle({maxWidth:"100%"});
});
it("shows only the existing side of additions and deletions",()=>{
  const view=render(<SideBySideDiff text="" staged={false} newFile truncated={false} media={{before:null,after:image()}}/>);
  expect(screen.getAllByRole("img",{name:"photo.png"})).toHaveLength(1);
  expect(screen.queryByRole("region",{name:"Index"})).not.toBeInTheDocument();
  view.rerender(<SideBySideDiff text="" staged truncated={false} media={{before:image(),after:null}}/>);
  expect(screen.getByRole("region",{name:"HEAD"})).toBeInTheDocument();expect(screen.queryByRole("region",{name:"Index"})).not.toBeInTheDocument();
});
it("provides localized metadata instead of loading large or unsupported payloads",()=>{
  setLanguage("fa");render(<FileContentPreview file={{...image("archive.zip"),kind:"binary",dataUrl:null,unavailable:"No built-in preview for this file type."}}/>);
  expect(screen.getByText(t("No built-in preview for this file type."))).toBeInTheDocument();expect(screen.getByText("ZIP")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("recovers from a broken image after selecting a different file",()=>{
  const view=render(<FileContentPreview file={image()}/>);fireEvent.error(screen.getByRole("img",{name:"photo.png"}));
  expect(screen.getByText(t("This image could not be displayed."))).toBeInTheDocument();
  view.rerender(<FileContentPreview file={image("valid.webp","new")}/>);expect(screen.getByRole("img",{name:"valid.webp"})).toBeInTheDocument();
});
it.each(["audio","video"] as const)("exposes %s playback controls without autoplay and handles unsupported codecs",kind=>{
  render(<FileContentPreview file={{...image(`sample.${kind==="audio"?"mp3":"mp4"}`),kind}}/>);
  const player=screen.getByLabelText(t(kind==="audio"?"Audio preview":"Video preview"));expect(player).toHaveAttribute("controls");expect(player).not.toHaveAttribute("autoplay");
  fireEvent.error(player);expect(screen.getByText(t("This media format could not be played."))).toBeInTheDocument();
});
