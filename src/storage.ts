import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { Database, emptyDatabase, validateDatabase, uid } from "./model";
const KEY = "roomrecord.database.v1";
export async function loadDatabase(): Promise<Database> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? validateDatabase(JSON.parse(raw)) : emptyDatabase();
}
export async function saveDatabase(db: Database) {
  await AsyncStorage.setItem(KEY, JSON.stringify(db));
}
export function fileURI(path: string): string {
  if (/^(data:|https?:|blob:)/.test(path)) return path;
  return new File(Paths.document, path).uri;
}
export async function retainPhoto(uri: string): Promise<string> {
  if (Platform.OS === "web") return uri;
  const dir = new Directory(Paths.document, "evidence");
  dir.create({ intermediates: true, idempotent: true });
  const path = `evidence/${uid()}.jpg`;
  new File(uri).copy(new File(Paths.document, path));
  return path;
}
export async function retainVideo(uri: string): Promise<string> {
  if (Platform.OS === "web") return uri;
  const dir = new Directory(Paths.document, "evidence");
  dir.create({ intermediates: true, idempotent: true });
  const path = `evidence/${uid()}.mov`;
  new File(uri).copy(new File(Paths.document, path));
  return path;
}
export async function imageData(path: string) {
  const uri = fileURI(path);
  if (uri.startsWith("data:")) return uri;
  return `data:image/jpeg;base64,${await new File(uri).base64()}`;
}
