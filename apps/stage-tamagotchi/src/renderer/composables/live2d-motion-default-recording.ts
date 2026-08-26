import idleExcitedProjectJson from '../assets/devtools/live2d-motion/idle-excited.json?raw'

import { parseLive2DMotionProject } from './live2d-motion-keyframes'

/** The validated trajectory that initializes the Live2D motion devtool. */
export const defaultLive2DMotionRecording = parseLive2DMotionProject(idleExcitedProjectJson).source
