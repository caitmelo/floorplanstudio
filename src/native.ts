import type { Evidence, FloorPlan, PropertyScan } from './model';
type CaptureModule = { isSupported(): boolean; scanRoom():Promise<FloorPlan>; scanProperty(rooms:{id:string;name:string}[]):Promise<PropertyScan>; capturePanorama():Promise<Omit<Evidence,'id'|'kind'|'caption'>>; viewPanorama(path:string):Promise<void>; };
export const captureModule:CaptureModule|null=null;
export const nativeReady=()=>false;
