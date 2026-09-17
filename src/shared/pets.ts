import { parsePet } from './pet-manifest';

const manifests = import.meta.glob('../../assets/*/pet.json', {eager:true,import:'default'});
export const pets = Object.entries(manifests).map(([file,value])=>({
  ...parsePet(value), assetKey:file.replace(/pet\.json$/, 'spritesheet.webp')
})).sort((a,b)=>a.id.localeCompare(b.id));
if (new Set(pets.map(p=>p.id)).size !== pets.length) throw Error('Duplicate pet IDs');
export const defaultPetId = 'deepseek';
export function findPet(id: unknown) { return pets.find(p=>p.id===id); }
export function resolvePet(id: unknown) {
  const pet = findPet(id) || findPet(defaultPetId);
  if (!pet) throw Error('Default pet missing');
  return pet;
}
