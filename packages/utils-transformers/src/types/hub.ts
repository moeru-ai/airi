import type { PretrainedConfig } from '@huggingface/transformers'
import type { InferenceSession } from 'onnxruntime-common'
import type { ProgressCallback } from './core'
import type { Device } from './devices'
import type { DType } from './dtypes'

/**
 * Options for loading a pretrained model.
 */
export interface ModelSpecificPretrainedOptions {
  /**
   * In case the relevant files are located inside a subfolder of the model repo on huggingface.co,
   * you can specify the folder name here.
   *
   * @default 'onnx'
   */
  subfolder?: string
  /**
   * If specified, load the model with this name (excluding the .onnx suffix). Currently only valid for encoder- or decoder-only models.
   *
   * @default null
   */
  model_file_name?: string
  /**
   * The device to run the model on. If not specified, the device will be chosen from the environment settings.
   */
  device?: Device
  /**
   * The data type to use for the model. If not specified, the data type will be chosen from the environment settings.
   */
  dtype?: DType
  /**
   * Whether to load the model using the external data format (used for models >= 2GB in size).
   *
   * @default false
   */
  use_external_data_format?: boolean
  /**
   * User-specified session options passed to the runtime. If not provided, suitable defaults will be chosen.
   */
  session_options?: InferenceSession.SessionOptions
}

/**
 * Options for loading a pretrained model.
 */
export interface PretrainedOptions {
  /**
   * If specified, this function will be called during model construction, to provide the user with progress updates.
   */
  progress_callback?: ProgressCallback
  /**
   * Configuration for the model to use instead of an automatically loaded configuration. Configuration can be automatically loaded when:
   * - The model is a model provided by the library (loaded with the *model id* string of a pretrained model).
   * - The model is loaded by supplying a local directory as `pretrained_model_name_or_path` and a configuration JSON file named *config.json* is found in the directory.
   */
  config?: PretrainedConfig
  /**
   * Path to a directory in which a downloaded pretrained model configuration should be cached if the standard cache should not be used.
   */
  cache_dir?: string
  /**
   * Whether or not to only look at local files (e.g., not try downloading the model).
   *
   * @default false
   */
  local_files_only?: boolean
  /**
   * The specific model version to use. It can be a branch name, a tag name, or a commit id,
   * since we use a git-based system for storing models and other artifacts on huggingface.co, so `revision` can be any identifier allowed by git.
   * NOTE: This setting is ignored for local requests.
   *
   * @default 'main'
   */
  revision?: string
}
