import affectionate from './airi-affectionate.png'
import agree from './airi-agree.png'
import angry from './airi-angry.png'
import awkward from './airi-awkward.png'
import celebrate from './airi-celebrate.png'
import confused from './airi-confused.png'
import disagree from './airi-disagree.png'
import happy from './airi-happy.png'
import sad from './airi-sad.png'
import surprised from './airi-surprised.png'
import thanks from './airi-thanks.png'
import tired from './airi-tired.png'

/** Static AIRI artwork shared by the catalog and saved chat slices. */
export const chatStickers = [
  { id: 'airi-happy', description: 'Happy', src: happy, emotions: ['happy'] as const },
  { id: 'airi-sad', description: 'Sad', src: sad, emotions: ['sad'] as const },
  { id: 'airi-confused', description: 'Confused', src: confused, emotions: ['confused'] as const },
  { id: 'airi-surprised', description: 'Surprised', src: surprised, emotions: ['surprised'] as const },
  { id: 'airi-thanks', description: 'Thank you', src: thanks, emotions: ['thanks', 'affectionate'] as const },
  { id: 'airi-celebrate', description: 'Celebration', src: celebrate, emotions: ['celebrate', 'happy'] as const },
  { id: 'airi-angry', description: 'Angry', src: angry, emotions: ['angry'] as const },
  { id: 'airi-tired', description: 'Tired', src: tired, emotions: ['tired'] as const },
  { id: 'airi-affectionate', description: 'Love', src: affectionate, emotions: ['affectionate', 'happy'] as const },
  { id: 'airi-awkward', description: 'Awkward', src: awkward, emotions: ['awkward'] as const },
  { id: 'airi-agree', description: 'Yes', src: agree, emotions: ['agree'] as const },
  { id: 'airi-disagree', description: 'No thanks', src: disagree, emotions: ['disagree'] as const },
] as const
