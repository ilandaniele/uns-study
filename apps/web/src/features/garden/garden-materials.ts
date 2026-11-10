import type { GardenBiomeId } from "@sala/contracts";

const original = "/garden/suelos-nativos-gpt-v2.webp";
const regions = "/garden/ecorregiones-argentinas-gpt-v3.webp";
export const GARDEN_MATERIALS: Record<GardenBiomeId, {file:string;columns:number;rows:number;frame:number;decor:readonly number[];swatch:string}> = {
  pampa: {file:original,columns:2,rows:2,frame:0,decor:[2,4,0,4],swatch:"#72934b"},
  ribera: {file:original,columns:2,rows:2,frame:1,decor:[1,5,3,1],swatch:"#518c76"},
  espinal: {file:original,columns:2,rows:2,frame:2,decor:[0,2,2,4],swatch:"#ab955d"},
  andino: {file:original,columns:2,rows:2,frame:3,decor:[3,5,0,5],swatch:"#477564"},
  paranaense: {file:regions,columns:3,rows:2,frame:0,decor:[5,3,5,4],swatch:"#915841"},
  yungas: {file:regions,columns:3,rows:2,frame:1,decor:[5,3,1,5],swatch:"#51764b"},
  monte: {file:regions,columns:3,rows:2,frame:2,decor:[0,2,0,2],swatch:"#bc9c6f"},
  estepa: {file:regions,columns:3,rows:2,frame:3,decor:[2,0,2,0],swatch:"#8d9280"},
  puna: {file:regions,columns:3,rows:2,frame:4,decor:[0,2,0,2],swatch:"#ad9a87"},
  ibera: {file:regions,columns:3,rows:2,frame:5,decor:[1,1,4,1],swatch:"#638749"},
};
