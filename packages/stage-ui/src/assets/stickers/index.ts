import catLaugh from './cat-laugh.png'
import catWow from './cat-wow.png'
import dog from './dog.png'
import heart from './heart.png'

/** Bundled images available to both the model catalog and the chat renderer. */
export const chatStickers = [
  { id: 'cat-laugh', description: 'A cat laughing with tears of joy', src: catLaugh },
  { id: 'cat-wow', description: 'A surprised cat', src: catWow },
  { id: 'dog', description: 'A friendly dog', src: dog },
  { id: 'heart', description: 'A red heart', src: heart },
] as const
