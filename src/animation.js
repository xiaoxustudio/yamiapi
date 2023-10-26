'use strict'

// ******************************** 动画播放器类 ********************************

class Animation {
  /** 动画可见性
   *  @type {boolean}
   */ visible

  /** 暂停播放
   *  @type {boolean}
   */ paused

  /** 结束播放
   *  @type {boolean}
   */ ended

  /** 动画位置对象
   *  @type {Object}
   */ position

  /** 动画帧当前的位置
   *  @type {number}
   */ index

  /** 当前动作动画帧的数量
   *  @type {number}
   */ length

  /** 动画循环开始位置
   *  @type {number}
   */ loopStart

  /** 动画循环次数
   *  @type {number}
   */ cycleIndex

  /** 动画播放速度
   *  @type {number}
   */ speed

  /** 动画锚点在光照纹理中的位置
   *  @type {number}
   */ anchorX

  /** 动画锚点在光照纹理中的位置
   *  @type {number}
   */ anchorY

  /** 动画的垂直偏移位置
   *  @type {number}
   */ offsetY

  /** 动画是否可旋转
   *  @type {boolean}
   */ rotatable

  /** 动画的旋转角度(弧度)
   *  @type {number}
   */ rotation

  /** 动画的不透明度
   *  @type {number}
   */ opacity

  /** 动画渲染排序的优先级
   *  @type {priority}
   */ priority

  /** 动画当前角度
   *  @type {number}
   */ angle

  /** 动画缩放系数
   *  @type {number}
   */ scale

  /** 动画当前方向(0, 1, 2, ...)
   *  @type {number}
   */ direction

  /** 动画镜像模式
   *  @type {string}
   */ mirror

  /** 动画色调列表
   *  @type {Array<Array<number>>}
   */ tints

  /** 动画文件数据
   *  @type {AnimFile}
   */ data

  /** 动画方向映射表
   *  @type {Array<Object>}
   */ dirMap

  /** 动画方向数据列表
   *  @type {Array<Object>}
   */ dirCases

  /** 动画当前动作图层
   *  @type {Array<Object>}
   */ layers

  /** 动画当前播放的动作名称
   *  @type {string}
   */ motionName

  /** 动画当前播放的动作对象
   *  @type {Object}
   */ motion

  /** 名称->动作数据映射表
   *  @type {Object}
   */ motions

  /** 精灵ID->精灵数据映射表
   *  @type {Object}
   */ sprites

  /** 精灵ID->图像ID映射表
   *  @type {Object}
   */ images

  /** 精灵ID->图像纹理映射表
   *  @type {Object}
   */ textures

  /** 图层动画帧上下文列表
   *  @type {Array<Object>}
   */ contexts

  /** 是不是UI组件
   *  @type {boolean}
   */ isUIComponent

  /** 已激活的粒子发射器列表
   *  @type {ParticleEmitterList}
   */ emitters

  /** 已激活的粒子发射器数量
   *  @type {number}
   */ emitterCount

  /** 存在粒子
   *  @type {boolean}
   */ existParticle = false

  /** 动画播放结束回调函数列表
   *  @type {Array<Function>|null}
   */ callbacks

  /** 动画播放器对自己的引用
   *  @type {Animation}
   */ animation

  /** 父节点对象
   *  @type {Object}
   */ parent

  /**
   * 动画播放器
   * @param {AnimFile} data 动画文件数据
   */
  constructor(data) {
    this.visible = true
    this.paused = false
    this.ended = false
    this.position = {x: 0, y: 0}
    this.index = 0
    this.length = 0
    this.loopStart = 0
    this.cycleIndex = 0
    this.speed = 1
    this.anchorX = 0
    this.anchorY = 0
    this.offsetY = 0
    this.rotatable = false
    this.rotation = 0
    this.opacity = 1
    this.priority = 0
    this.angle = 0
    this.scale = 1
    this.direction = -1
    this.mirror = false
    this.tints = []
    this.data = data
    this.dirMap = Array.empty
    this.dirCases = null
    this.layers = null
    this.motionName = ''
    this.motion = null
    this.motions = data.motions
    this.sprites = data.sprites
    this.images = data.images
    this.textures = {}
    this.contexts = []
    this.isUIComponent = false
    this.emitters = null
    this.emitterCount = 0
    this.callbacks = null
    this.animation = this
    this.parent = null
  }

  // 跳转到指定帧
  goto(index) {
    index = Math.clamp(index, 0, this.length - 1)
    // 跳转到前面的动画帧时增加循环计数
    if (index < this.index) {
      this.cycleIndex++
    }
    this.index = index
    this.ended = false
  }

  /** 重新开始播放 */
  restart() {
    this.index = 0
    this.ended = false
  }

  /**
   * 设置动画动作
   * @param {string} motionName 动作名称
   * @returns {boolean} 操作是否成功
   */
  setMotion(motionName) {
    this.motionName = motionName
    const motion = this.motions[motionName]
    if (motion) {
      // 执行结束回调
      this.finish()
      this.motion = motion
      this.dirCases = motion.dirCases
      // 如果方向模式发生变化，重新计算方向
      if (this.dirMap !== motion.dirMap) {
        this.dirMap = motion.dirMap
        this.direction = -1
        this.setAngle(this.angle)
      } else {
        this.loadDirCase()
      }
      return true
    }
    return false
  }

  /** 加载动画方向 */
  loadDirCase() {
    const params = this.dirMap[this.direction]
    if (params) {
      const dirCase = this.dirCases[params.index]
      this.layers = dirCase.layers
      // 销毁上下文中的粒子发射器
      // 加载当前动作的上下文
      this.destroyContextEmitters()
      this.loadContexts(this.contexts)
      this.length = dirCase.length
      this.loopStart = dirCase.loopStart
      this.cycleIndex = 0
      this.ended = false
    }
  }

  /**
   * 设置动画角度
   * @param {number} angle 弧度
   * @returns {boolean} 动画是否成功切换了方向
   */
  setAngle(angle) {
    this.angle = angle
    const directions = this.dirMap.length
    // 将角度映射为0~方向数量的数值
    const proportion = Math.modRadians(angle) / (Math.PI * 2)
    const section = (proportion * directions + 0.5) % directions
    // 如果角度的位置刚好是两个方向的交界处，则优先使用之前的方向(容错值0.01)
    if (Math.abs(section - Math.round(section)) < 0.01 && this.direction >= 0) {
      const distance = Math.abs(section - (this.direction + 0.5))
      if (distance < 1 || distance > directions - 1) {
        this.updateRotation()
        return false
      }
    }
    const direction = Math.floor(section)
    const dirChanged = this.setDirection(direction)
    this.updateRotation()
    return dirChanged
  }

  /**
   * 设置动画方向
   * @param {number} direction 方向
   * @returns {boolean} 动画是否成功切换了方向
   */
  setDirection(direction) {
    if (this.direction !== direction) {
      const params = this.dirMap[direction]
      if (!params) return false
      this.direction = direction
      this.mirror = params.mirror
      this.finish()
      this.loadDirCase()
      return true
    }
    return false
  }

  /**
   * 获取动画当前播放时间
   * @returns {number} 毫秒
   */
  getCurrentTime() {
    return this.index * Animation.step
  }

  /**
   * 获取动画动作持续时间
   * @returns {number} 毫秒
   */
  getDuration() {
    return this.length * Animation.step
  }

  /**
   * 获取动画方向的角度
   * @param {number} direction 动画方向
   * @returns {number} 动画方向的角度(弧度)
   */
  getDirectionAngle() {
    const directions = this.dirMap.length
    return this.direction / directions * Math.PI * 2
  }

  /** 更新旋转角度 */
  updateRotation() {
    // 如果开启了动画旋转，调整旋转角度
    if (this.rotatable) {
      this.rotation = this.mirror
      ? -this.angle - this.getDirectionAngle()
      : +this.angle - this.getDirectionAngle()
    }
  }

  /**
   * 设置动画在场景中的位置
   * @param {{x: number, y: number}} position 具有场景坐标的对象
   */
  setPosition(position) {
    this.position = position
  }

  /**
   * 设置动画绘制在屏幕中的位置
   * @param {number} x 场景X
   * @param {number} y 场景Y
   */
  setDrawingPosition(x, y) {
    const matrix = Animation.matrix.set6f(1, 0, 0, 1, x, y)
    // 设置镜像
    if (this.mirror) {
      matrix.mirrorh()
    }
    // 设置垂直偏移
    if (this.offsetY !== 0) {
      matrix.translateY(this.offsetY)
    }
    // 设置旋转
    if (this.rotation !== 0) {
      matrix.rotate(this.rotation)
    }
    // 设置缩放
    if (this.scale !== 1) {
      matrix.scale(this.scale, this.scale)
    }
  }

  /**
   * 设置精灵图像映射表
   * @param {Object} images 优先使用的角色精灵图像映射表
   */
  setSpriteImages(images) {
    // 让指定的图像映射表(更高优先级)继承当前的动画图像映射表
    this.images = Object.setPrototypeOf(images, this.images)
  }

  /** 恢复精灵图像映射表 */
  restoreSpriteImages() {
    this.images = Object.getPrototypeOf(this.images)
  }

  /**
   * 更新当前播放的动画帧参数
   * @param {Object[]} contexts 动画图层上下文列表
   * @param {number} index 动画帧当前的位置
   */
  updateFrameParameters() {
    const {contexts, index} = this
    const {count} = contexts
    // 遍历所有动画图层
    outer: for (let i = 0; i < count; i++) {
      const context = contexts[i]
      const frames = context.layer.frames
      const last = frames.length - 1
      for (let i = 0; i <= last; i++) {
        const frame = frames[i]
        const start = frame.start
        const end = frame.end
        // 查找index所在的动画关键帧
        if (index >= start && index < end) {
          const easingId = frame.easingId
          // 如果存在过渡，并且不是尾部关键帧
          if (easingId && i < last) {
            // 在当前帧和下一帧之间进行过渡插值
            const next = frames[i + 1]
            const time = Easing.get(easingId).map(
              (index - start) / (next.start - start)
            )
            // 更新插值后的上下文
            context.update(frame, time, next)
          } else {
            // 更新当前帧的上下文
            context.update(frame)
          }
          continue outer
        }
      }
      // 找不到关键帧就重置上下文
      context.reset()
    }
  }

  /**
   * 加载动画图层上下文列表
   * @param {Object[]} contexts 动画图层上下文列表
   */
  loadContexts(contexts) {
    Animation.loadContexts(this, contexts)
  }

  /**
   * 更新动画播放进度
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    deltaTime *= this.speed
    if (this.paused === false && this.ended === false) {
      this.existParticles = false
      if (this.length !== 0) {
        // 递增动画帧索引
        this.index += deltaTime / Animation.step
        // 如果动画播放结束
        if (this.index >= this.length) {
          if (this.motion.loop) {
            // 如果动作是循环的，重新开始
            this.index = this.index % this.length + this.loopStart
            this.cycleIndex++
          } else {
            // 否则设为尾帧索引，执行结束回调
            this.index = this.length - 1
            this.ended = true
            this.finish()
            // 临时用于播放结束后回调（会修改）
            this.end?.()
          }
        }
      }
    }
    // 更新粒子发射器
    if (this.emitterCount !== 0) {
      this.emitParticles(deltaTime)
    }
  }

  /**
   * 激活动画(当动画可见时)
   * @param {number} drawX 动画的场景像素X
   * @param {number} drawY 动画的场景像素Y
   * @param {number} lightX 动画的光照采样X
   * @param {number} lightY 动画的光照采样Y
   */
  activate(drawX, drawY, lightX, lightY) {
    this.setDrawingPosition(drawX, drawY)
    this.updateFrameParameters()
    this.anchorX = lightX
    this.anchorY = lightY
  }

  /**
   * 获取精灵图纹理
   * @param {string} spriteId 精灵图ID
   * @returns {ImageTexture|null} 已加载完成的纹理
   */
  getTexture(spriteId) {
    const textures = this.textures
    const texture = textures[spriteId]
    // 初次访问需要先创建纹理
    if (texture === undefined) {
      this.loadTexture(spriteId)
      return textures[spriteId]
    }
    return texture
  }

  /**
   * 加载精灵图纹理
   * @param {string} spriteId 精灵图ID
   * @returns {ImageTexture|null} 已加载完成或正在加载中的纹理
   */
  loadTexture(spriteId) {
    const {textures} = this
    if (textures[spriteId]) {
      return textures[spriteId]
    }
    textures[spriteId] = null
    const sprite = this.sprites[spriteId]
    const imageId = this.images[spriteId]
    if (sprite !== undefined && imageId) {
      const texture = new ImageTexture(imageId)
      // 如果纹理已完成加载，设置好参数直接返回
      texture.on('load', () => {
        if (this.textures === textures) {
          // 纹理加载结束后如果动画还存在，设置参数
          const {floor, max} = Math
          const {base} = texture
          const {hframes, vframes} = sprite
          const width = floor(max(base.width / hframes, 1))
          const height = floor(max(base.height / vframes, 1))
          texture.x = null
          texture.y = null
          texture.width = width
          texture.height = height
          textures[spriteId] = texture
        } else {
          // 如果动画已销毁，则销毁纹理
          texture.destroy()
        }
      })
      return texture
    }
    return null
  }

  /**
   * 删除精灵图纹理
   * @param {string} spriteId 精灵图ID
   */
  deleteTexture(spriteId) {
    const {textures} = this
    if (spriteId in textures) {
      textures[spriteId]?.destroy()
      delete textures[spriteId]
    }
  }

  /**
   * 发射粒子
   * @param {number} deltaTime 增量时间(毫秒)
   */
  emitParticles(deltaTime) {
    const {contexts} = this
    const {count} = contexts
    // 遍历所有图层上下文，查找粒子层
    for (let i = 0; i < count; i++) {
      const context = contexts[i]
      const {layer} = context
      if (layer.class === 'particle') {
        const {frame, emitter} = context
        // 如果当前帧有效，且存在粒子发射器
        if (frame !== null && emitter !== undefined) {
          switch (layer.angle) {
            case 'default':
              // 发射器角度设为默认
              emitter.angle = 0
              break
            case 'inherit': {
              // 发射器角度继承动画帧
              const {matrix} = context
              const a = matrix[0]
              const b = matrix[1]
              emitter.angle = Math.atan2(b, a)
              break
            }
          }
          emitter.emitParticles(deltaTime)
        }
      }
    }
  }

  /**
   * 绘制动画
   * @param {string} [light] 光线采样模式
   */
  draw(light) {
    const {contexts} = this
    const {count} = contexts
    // 遍历所有图层上下文，查找精灵层
    for (let i = 0; i < count; i++) {
      const context = contexts[i]
      const {layer} = context
      if (layer.class === 'sprite' &&
        context.frame !== null) {
        const key = layer.sprite
        const texture = this.getTexture(key)
        // 如果获取到了精灵纹理，则绘制图像
        if (texture !== null) {
          this.drawSprite(context, texture, light)
        }
      }
    }
  }

  /**
   * 绘制精灵图像
   * @param {Object} context 动画图层上下文
   * @param {ImageTexture} texture 精灵图纹理
   * @param {string} [light] 光线采样模式
   */
  drawSprite(context, texture, light = context.layer.light) {
    const gl = GL
    const vertices = gl.arrays[0].float32
    const attributes = gl.arrays[0].uint32
    const renderer = gl.batchRenderer
    const response = renderer.response
    const matrix = context.matrix
    const layer = context.layer
    const frame = context.frame
    const tint = context.tint
    const base = texture.base
    const tw = base.width
    const th = base.height
    const sw = texture.width
    const sh = texture.height
    // 优先使用纹理的x和y值作为采样的左上角位置
    // 方便使用脚本修改(设置非网格化的采样区域)
    const sx = texture.x ?? frame.spriteX * sw
    const sy = texture.y ?? frame.spriteY * sh
    const L = -(sw * context.anchorX + context.pivotX)
    const T = -(sh * context.anchorY + context.pivotY)
    const R = L + sw
    const B = T + sh
    const a = matrix[0]
    const b = matrix[1]
    const c = matrix[3]
    const d = matrix[4]
    const e = matrix[6]
    const f = matrix[7]
    const x1 = a * L + c * T + e
    const y1 = b * L + d * T + f
    const x2 = a * L + c * B + e
    const y2 = b * L + d * B + f
    const x3 = a * R + c * B + e
    const y3 = b * R + d * B + f
    const x4 = a * R + c * T + e
    const y4 = b * R + d * T + f
    const sl = sx / tw
    const st = sy / th
    const sr = (sx + sw) / tw
    const sb = (sy + sh) / th
    renderer.setBlendMode(layer.blend)
    renderer.push(base.index)
    const vi = response[0] * 8
    const mode = Animation.lightSamplingModes[light]
    const alpha = Math.round(context.opacity * 255)
    const param = response[1] | alpha << 8 | mode << 16
    const redGreen = tint[0] + (tint[1] << 16) + 0x00ff00ff
    const blueGray = tint[2] + (tint[3] << 16) + 0x00ff00ff
    const anchor = light !== 'anchor' ? 0 : (
      Math.round(Math.clamp(this.anchorX, 0, 1) * 0xffff)
    | Math.round(Math.clamp(this.anchorY, 0, 1) * 0xffff) << 16
    )
    // 设置顶点数据：顶点坐标，纹理坐标，纹理索引，不透明度，光照模式，色调，锚点
    vertices  [vi    ] = x1
    vertices  [vi + 1] = y1
    vertices  [vi + 2] = sl
    vertices  [vi + 3] = st
    attributes[vi + 4] = param
    attributes[vi + 5] = redGreen
    attributes[vi + 6] = blueGray
    attributes[vi + 7] = anchor
    vertices  [vi + 8] = x2
    vertices  [vi + 9] = y2
    vertices  [vi + 10] = sl
    vertices  [vi + 11] = sb
    attributes[vi + 12] = param
    attributes[vi + 13] = redGreen
    attributes[vi + 14] = blueGray
    attributes[vi + 15] = anchor
    vertices  [vi + 16] = x3
    vertices  [vi + 17] = y3
    vertices  [vi + 18] = sr
    vertices  [vi + 19] = sb
    attributes[vi + 20] = param
    attributes[vi + 21] = redGreen
    attributes[vi + 22] = blueGray
    attributes[vi + 23] = anchor
    vertices  [vi + 24] = x4
    vertices  [vi + 25] = y4
    vertices  [vi + 26] = sr
    vertices  [vi + 27] = st
    attributes[vi + 28] = param
    attributes[vi + 29] = redGreen
    attributes[vi + 30] = blueGray
    attributes[vi + 31] = anchor
  }

  /** 释放资源 */
  release() {
    this.destroy()
    this.textures = {}
  }

  /** 销毁动画实例 */
  destroy() {
    if (!this.textures) return
    // 销毁图像纹理
    for (const texture of Object.values(this.textures)) {
      texture?.destroy()
    }
    this.textures = null
    // 销毁上下文的粒子发射器
    this.destroyContextEmitters()
    // 销毁已激活的粒子发射器
    this.destroyActiveEmitters()
  }

  /** 销毁图层上下文的粒子发射器 */
  destroyContextEmitters() {
    const {contexts} = this
    const {count} = contexts
    for (let i = 0; i < count; i++) {
      const context = contexts[i]
      const emitter = context.emitter
      if (emitter !== undefined) {
        // 标记发射器为已禁用
        emitter.disabled = true
        delete context.emitter
        this.emitterCount--
      }
    }
  }

  /** 销毁已激活的粒子发射器 */
  destroyActiveEmitters() {
    if (this.isUIComponent) {
      for (const emitter of this.emitters) {
        emitter.destroy()
      }
    }
  }

  /**
   * 设置当前动作播放结束时的回调函数
   * @param {function} callback 回调函数
   */
  onFinish(callback) {
    if (this.complete) {
      callback(this)
    } else {
      if (this.callbacks) {
        this.callbacks.push(callback)
      } else {
        this.callbacks = [callback]
      }
    }
  }

  /** 执行当前动作播放结束回调 */
  finish() {
    const {callbacks} = this
    if (callbacks !== null) {
      this.callbacks = null
      for (const callback of callbacks) {
        callback(this)
      }
    }
  }

  // 设置为UI动画组件
  setAsUIComponent() {
    if (!this.isUIComponent) {
      this.isUIComponent = true
      this.emitters = new ParticleEmitterList()
    }
  }

  // 每一帧动画的持续时间(毫秒)
  static step = 0

  // 动画公共矩阵
  static matrix = new Matrix()

  // 光照采样模式映射表
  static lightSamplingModes = {raw: 0, global: 1, anchor: 2}

  // 各种模式的动画方向映射表
  static dirMaps = {
    '1-dir': [
      {index: 0, mirror: false},
    ],
    '1-dir-mirror': [
      {index: 0, mirror: false},
      {index: 0, mirror: true},
    ],
    '2-dir': [
      {index: 1, mirror: false},
      {index: 0, mirror: false},
    ],
    '3-dir-mirror': [
      {index: 1, mirror: false},
      {index: 0, mirror: false},
      {index: 1, mirror: true},
      {index: 2, mirror: false},
    ],
    '4-dir': [
      {index: 2, mirror: false},
      {index: 0, mirror: false},
      {index: 1, mirror: false},
      {index: 3, mirror: false},
    ],
    '5-dir-mirror': [
      {index: 1, mirror: false},
      {index: 3, mirror: false},
      {index: 0, mirror: false},
      {index: 3, mirror: true},
      {index: 1, mirror: true},
      {index: 4, mirror: true},
      {index: 2, mirror: false},
      {index: 4, mirror: false},
    ],
    '8-dir': [
      {index: 2, mirror: false},
      {index: 5, mirror: false},
      {index: 0, mirror: false},
      {index: 4, mirror: false},
      {index: 1, mirror: false},
      {index: 6, mirror: false},
      {index: 3, mirror: false},
      {index: 7, mirror: false},
    ],
  }

  /** 初始化动画相关数据 */
  static initialize() {
    // 计算一帧动画的时长
    this.step = 1000 / Data.config.animation.frameRate
  }

  /**
   * 加载动画图层上下文列表
   * @param {Animation} animation 动画播放器实例
   * @param {Object[]} contexts 动画图层上下文列表
   */
  static loadContexts(animation, contexts) {
    contexts.count = 0
    if (animation.layers !== null) {
      // 如果动画已设置动作，加载所有图层上下文
      this._loadContext(animation, animation.layers, null, contexts)
    }
  }

  /**
   * 加载动画图层上下文
   * @param {Animation} animation 动画播放器实例
   * @param {Object[]} layers 动画图层列表
   * @param {Object} parent 父级动画图层
   * @param {Object[]} contexts 动画图层上下文列表
   */
  static _loadContext(animation, layers, parent, contexts) {
    for (const layer of layers) {
      let context = contexts[contexts.count]
      if (context === undefined) {
        // 新建动画图层上下文
        context = contexts[contexts.count] = {
          animation: animation,
          parent: null,
          layer: null,
          frame: null,
          matrix: new Matrix(),
          anchorX: 0,
          anchorY: 0,
          pivotX: 0,
          pivotY: 0,
          opacity: 0,
          update: null,
          reset: Animation.contextReset,
        }
      }
      contexts.count++
      context.parent = parent
      context.layer = layer
      // 为不同类型的图层设置各自的更新方法
      switch (layer.class) {
        case 'joint':
          context.update = Animation.contextUpdate
          break
        case 'sprite':
          context.update = Animation.contextUpdateSprite
          break
        case 'particle':
          context.update = Animation.contextUpdateParticle
          break
        case 'sound':
          context.update = Animation.contextUpdateSound
          context.version = -1
          break
      }
      // 如果是关节层，则加载子图层列表
      if (layer.class === 'joint') {
        this._loadContext(animation, layer.children, context, contexts)
      }
    }
  }

  /** 图层上下文方法 - 重置 */
  static contextReset() {
    const parent = this.parent
    const matrix = this.matrix
    if (parent !== null) {
      // 从父级图层继承属性
      matrix.set(parent.matrix)
      this.opacity = parent.opacity
    } else {
      // 没有父级图层的情况
      matrix.set(Animation.matrix)
      this.opacity = this.animation.opacity
    }
    this.frame = null
  }

  /**
   * 上下文方法 - 更新(通用)
   * @param {Array} frame 动画图层当前帧的数据
   * @param {number} time 当前帧到下一帧的过渡时间(比率)
   * @param {Array} next 动画图层下一帧的数据
   */
  static contextUpdate(frame, time, next) {
    const parent = this.parent
    const matrix = this.matrix
    if (parent !== null) {
      // 从父级图层继承属性
      matrix.set(parent.matrix)
      this.opacity = parent.opacity
    } else {
      // 没有父级图层的情况
      matrix.set(Animation.matrix)
      this.opacity = this.animation.opacity
    }
    // 获取当前动画帧的属性
    let positionX = frame.x
    let positionY = frame.y
    let rotation = frame.rotation
    let scaleX = frame.scaleX
    let scaleY = frame.scaleY
    let opacity = frame.opacity
    if (next !== undefined) {
      // 与下一帧属性进行插值计算
      const reverse = 1 - time
      positionX = positionX * reverse + next.x * time
      positionY = positionY * reverse + next.y * time
      rotation = rotation * reverse + next.rotation * time
      scaleX = scaleX * reverse + next.scaleX * time
      scaleY = scaleY * reverse + next.scaleY * time
      opacity = opacity * reverse + next.opacity * time
    }
    // 使用动画帧属性进行矩阵变换
    matrix
    .translate(positionX, positionY)
    .rotate(Math.radians(rotation))
    .scale(scaleX, scaleY)
    this.opacity *= opacity
    this.frame = frame
  }

  /**
   * 上下文方法 - 更新精灵层
   * @param {Array} frame 动画图层当前帧的数据
   * @param {number} time 当前帧到下一帧的过渡时间(比率)
   * @param {Array} next 动画图层下一帧的数据
   */
  static contextUpdateSprite(frame, time, next) {
    Animation.contextUpdate.call(this, frame, time, next)
    // 读取当前动画帧的参数
    let anchorX = frame.anchorX
    let anchorY = frame.anchorY
    let pivotX = frame.pivotX
    let pivotY = frame.pivotY
    let red = frame.tint[0]
    let green = frame.tint[1]
    let blue = frame.tint[2]
    let gray = frame.tint[3]
    // 与下一帧参数进行插值计算
    if (next !== undefined) {
      const reverse = 1 - time
      anchorX = anchorX * reverse + next.anchorX * time
      anchorY = anchorY * reverse + next.anchorY * time
      pivotX = pivotX * reverse + next.pivotX * time
      pivotY = pivotY * reverse + next.pivotY * time
      red = red * reverse + next.tint[0] * time
      green = green * reverse + next.tint[1] * time
      blue = blue * reverse + next.tint[2] * time
      gray = gray * reverse + next.tint[3] * time
    }
    // 混合全局色调
    for (const tint of this.animation.tints) {
      red += tint[0]
      green += tint[1]
      blue += tint[2]
      gray += tint[3]
    }
    // 获取或创建色调数组
    let tint = this.tint
    if (tint === undefined) {
      tint = this.tint = new Int16Array(4)
    }
    // 写入参数(限制色调范围)
    this.anchorX = anchorX
    this.anchorY = anchorY
    this.pivotX = pivotX
    this.pivotY = pivotY
    tint[0] = Math.clamp(red, -255, 255)
    tint[1] = Math.clamp(green, -255, 255)
    tint[2] = Math.clamp(blue, -255, 255)
    tint[3] = Math.clamp(gray, 0, 255)
  }

  /**
   * 上下文方法 - 更新粒子层
   * @param {Array} frame 动画图层当前帧的数据
   * @param {number} time 当前帧到下一帧的过渡时间(比率)
   * @param {Array} next 动画图层下一帧的数据
   */
  static contextUpdateParticle(frame, time, next) {
    Animation.contextUpdate.call(this, frame, time, next)
    // 获取或创建粒子发射器
    let emitter = this.emitter
    if (emitter === undefined) {
      const guid = this.layer.particleId
      const data = Data.particles[guid]
      if (!data) return
      const position = this.animation.position
      emitter = new ParticleEmitter(data)
      emitter.disabled = false
      emitter.matrix = this.matrix
      emitter.priority = this.animation.priority
      emitter.x = position.x
      emitter.y = position.y
      this.emitter = emitter
      this.animation.emitterCount++
      const {alwaysDraw} = emitter
      if (this.animation.isUIComponent) {
        this.animation.emitters.append(emitter)
      } else {
        // 委托给场景粒子发射器列表进行更新
        Scene.emitters.append(emitter)
      }
      emitter.update = deltaTime => {
        // 偏移已激活粒子
        if (this.layer.position === 'relative') {
          let ox = position.x - emitter.x
          let oy = position.y - emitter.y
          if (!this.animation.isUIComponent) {
            ox *= Scene.binding.tileWidth
            oy *= Scene.binding.tileHeight
          }
          emitter.translateParticles(ox, oy)
        }
        // 同步发射器和动画的位置
        if (!this.animation.isUIComponent) {
          emitter.x = position.x
          emitter.y = position.y
        }
        // 更新已激活粒子
        const speed = this.animation.speed
        const count = emitter.updateParticles(deltaTime * speed)
        this.animation.existParticles = true
        if (count === 0 && emitter.disabled) {
          Callback.push(() => {
            emitter.destroy()
            emitter.parent.remove(emitter)
          })
        }
        // 只要存在粒子，总是进行绘制
        if (alwaysDraw === false) {
          emitter.alwaysDraw = count !== 0
        }
      }
    }
    // 获取当前动画帧的属性
    let scale = frame.scale * this.animation.scale
    let speed = frame.speed
    if (next !== undefined) {
      // 与下一帧属性进行插值计算
      const reverse = 1 - time
      scale = scale * reverse + next.scale * time
      speed = speed * reverse + next.speed * time
    }
    emitter.scale = scale
    emitter.speed = speed
    emitter.opacity = this.opacity
  }

  /**
   * 上下文方法 - 更新音效层
   * @param {Array} frame 动画图层当前帧的数据
   */
  static contextUpdateSound(frame) {
    // 如果当前帧是关键帧
    const animation = this.animation
    if (animation.paused) return
    if (animation.index < frame.start + 1) {
      // 如果当前帧未播放过
      const version = animation.cycleIndex * animation.length + Math.floor(animation.index)
      if (this.version !== version) {
        this.version = version
        // 在动画的位置播放衰减音效
        if (frame.sound && animation.position) {
          const speed = this.layer.playbackRate === 'inherit' ? animation.speed : 1
          if (animation.isUIComponent) {
            AudioManager.se.play(frame.sound, frame.volume, speed)
          } else {
            AudioManager.se.playAt(frame.sound, animation.position, frame.volume, speed)
          }
        }
      }
    }
  }
}

// ******************************** 粒子发射器类 ********************************

class ParticleEmitter {
  /** 是否总是发射粒子
   *  @type {boolean}
   */ alwaysEmit

  /** 是否总是绘制粒子
   *  @type {boolean}
   */ alwaysDraw

  /** 粒子发射器可见性
   *  @type {boolean}
   */ visible

  /** 粒子发射初始水平位置
   *  @type {number}
   */ startX

  /** 粒子发射初始垂直位置
   *  @type {number}
   */ startY

  /** 粒子发射角度
   *  @type {number}
   */ angle

  /** 粒子缩放系数
   *  @type {number}
   */ scale

  /** 粒子速度
   *  @type {number}
   */ speed

  /** 不透明度
   *  @type {number}
   */ opacity

  /** 粒子发射器优先级
   *  @type {number}
   */ priority

  /** 粒子发射器的矩阵
   *  @type {number}
   */ matrix

  /** 粒子发射器的图层
   *  @type {Array<ParticleLayer>}
   */ layers

  /** 视差图的父级对象
   *  @type {Object|null}
   */ parent

  /**
   * 粒子发射器
   * @param {ParticleFile} data 粒子文件数据
   */
  constructor(data) {
    let alwaysEmit = ParticleEmitter.alwaysEmit
    let alwaysDraw = ParticleEmitter.alwaysDraw
    // 创建粒子图层
    const sLayers = data.layers
    const sLength = sLayers.length
    const dLayers = new Array(sLength)
    for (let i = 0; i < sLength; i++) {
      const sLayer = sLayers[i]
      // 如果有一个粒子层的发射区域是屏幕边缘，设为总是发射和绘制
      if (sLayer.area.type === 'edge') {
        alwaysEmit = true
        alwaysDraw = true
      }
      dLayers[i] = new ParticleLayer(this, sLayer)
    }
    this.alwaysEmit = alwaysEmit
    this.alwaysDraw = alwaysDraw
    this.visible = true
    this.startX = 0
    this.startY = 0
    this.angle = 0
    this.scale = 1
    this.speed = 1
    this.opacity = 1
    this.priority = 0
    this.matrix = null
    this.layers = dLayers
    this.parent = null
  }

  /**
   * 更新粒子发射器
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    this.emitParticles(deltaTime)
    this.updateParticles(deltaTime)
  }

  /**
   * 发射粒子
   * @param {number} deltaTime 增量时间(毫秒)
   */
  emitParticles(deltaTime) {
    for (const layer of this.layers) {
      layer.emitParticles(deltaTime)
    }
  }

  /**
   * 更新粒子的运动
   * @param {number} deltaTime 增量时间(毫秒)
   * @returns {number} 发射器中已激活的粒子数量
   */
  updateParticles(deltaTime) {
    let count = 0
    for (const layer of this.layers) {
      count += layer.updateParticles(deltaTime)
    }
    // 累计场景中的粒子数量
    Scene.particleCount += count
    // 返回已激活粒子的数量
    return count
  }

  /**
   * 平移粒子的位置
   * @param {number} x 水平位移
   * @param {number} y 垂直位移
   */
  translateParticles(x, y) {
    for (const layer of this.layers) {
      layer.translateParticles(x, y)
    }
  }

  /**
   * 绘制所有图层中的粒子元素
   * @param {Matrix} [matrix] 投影矩阵
   */
  draw(matrix) {
    for (const layer of this.layers) {
      layer.draw(matrix)
    }
  }

  /**
   * 判断发射器是否为空(粒子数量为0)
   * @returns {boolean}
   */
  isEmpty() {
    for (const {elements} of this.layers) {
      if (elements.count !== 0) {
        return false
      }
    }
    return true
  }

  /** 销毁所有图层 */
  destroy() {
    for (const layer of this.layers) {
      layer.destroy()
    }
  }

  /** 当发射器不可见时，是否总是发射粒子 */
  static alwaysEmit = false

  /** 当发射器不可见时，是否总是绘制粒子 */
  static alwaysDraw = false
}

// ******************************** 粒子图层类 ********************************

class ParticleLayer {
  /** 绑定的粒子发射器对象
   *  @type {ParticleEmitter}
   */ emitter

  /** 粒子图层数据
   *  @type {Object}
   */ data

  /** 粒子精灵纹理
   *  @type {ImageTexture|null}
   */ texture

  /** 粒子精灵纹理的宽度
   *  @type {number}
   */ textureWidth

  /** 粒子精灵纹理的高度
   *  @type {number}
   */ textureHeight

  /** 粒子精灵的单位宽度
   *  @type {number}
   */ unitWidth

  /** 粒子精灵的单位高度
   *  @type {number}
   */ unitHeight

  /** 粒子已经播放的时间
   *  @type {number}
   */ elapsed

  /** 当前图层的粒子容量
   *  @type {number}
   */ capacity

  /** 已发射的粒子数量
   *  @type {number}
   */ count

  /** 可用的粒子库存量
   *  @type {number}
   */ stocks

  /** 已激活的粒子元素数组
   *  @type {Array<ParticleElement>}
   */ elements

  /** 可复用的粒子元素数组
   *  @type {Array<ParticleElement>}
   */ reserves

  /**
   * 粒子图层对象
   * @param {ParticleEmitter} emitter 绑定的粒子发射器对象
   * @param {Object} data 粒子图层数据
   */
  constructor(emitter, data) {
    this.emitter = emitter
    this.data = data
    this.texture = null
    this.textureWidth = 0
    this.textureHeight = 0
    this.unitWidth = 0
    this.unitHeight = 0
    this.elapsed = data.interval - data.delay
    this.capacity = 0
    this.count = 0
    this.stocks = 0
    this.elements = []
    this.elements.count = 0
    this.reserves = []
    this.reserves.count = 0

    // 更新发射数量
    this.updateCount()

    // 更新过渡映射表
    this.updateEasing()

    // 加载纹理
    this.loadTexture()
  }

  /**
   * 发射粒子元素
   * @param {number} deltaTime 增量时间(毫秒)
   */
  emitParticles(deltaTime) {
    let stocks = this.stocks
    // 如果粒子库存量为0，停止发射
    if (stocks === 0) return
    this.elapsed += deltaTime * this.emitter.speed
    const data = this.data
    const interval = data.interval
    let count = Math.floor(this.elapsed / interval)
    if (count > 0) {
      // 0 * Infinity returns NaN
      this.elapsed -= interval * count || 0
      const elements = this.elements
      const maximum = ParticleLayer.maximum
      let eCount = elements.count
      // 如果激活的粒子达到最大数量，停止发射
      if (eCount === maximum) return
      const reserves = this.reserves
      let rCount = reserves.count
      spawn: {
        // 重用旧的粒子
        while (rCount > 0) {
          const element = reserves[--rCount]
          elements[eCount++] = element
          element.initialize()
          count--
          stocks--
          if (count === 0 || stocks === 0) {
            break spawn
          }
        }
        // 创建新的粒子
        for (let i = this.capacity; i < maximum; i++) {
          elements[eCount++] = new ParticleElement(this)
          this.capacity = i + 1
          count--
          stocks--
          if (count === 0 || stocks === 0) {
            break spawn
          }
        }
      }
      elements.count = eCount
      reserves.count = rCount
      this.stocks = stocks
    }
  }

  /**
   * 更新粒子的运动
   * @param {number} deltaTime 增量时间(毫秒)
   * @returns {number} 当前图层中已激活粒子的数量
   */
  updateParticles(deltaTime) {
    const elements = this.elements
    let eCount = elements.count
    if (eCount === 0) return 0
    const reserves = this.reserves
    let rCount = reserves.count
    let offset = 0
    deltaTime *= this.emitter.speed
    for (let i = 0; i < eCount; i++) {
      const element = elements[i]
      switch (element.update(deltaTime)) {
        case false:
          // 回收未激活粒子
          reserves[rCount + offset] = element
          offset++
          continue
        default:
          // 重新排序已激活粒子
          if (offset !== 0) {
            elements[i - offset] = element
          }
          continue
      }
    }
    // 如果有粒子被回收，更新相关属性
    if (offset !== 0) {
      elements.count = eCount - offset
      reserves.count = rCount + offset
      eCount = elements.count
    }
    // 返回已激活粒子的数量
    return eCount
  }

  /**
   * 平移粒子的位置
   * @param {number} x 水平位移
   * @param {number} y 垂直位移
   */
  translateParticles(x, y) {
    const {elements} = this
    const {count} = elements
    for (let i = 0; i < count; i++) {
      const element = elements[i]
      element.x += x
      element.y += y
    }
  }

  /**
   * 批量绘制粒子元素
   * @param {Matrix} [matrix] 投影矩阵
   */
  draw(matrix) {
    const gl = GL
    const data = this.data
    const texture = this.texture
    const elements = this.elements
    const count = elements.count
    let vi = 0
    switch (data.sort) {
      case 'youngest-in-front':
        // 粒子排序：最新的在前面
        for (let i = 0; i < count; i++) {
          elements[i].draw(vi)
          vi += 20
        }
        break
      case 'oldest-in-front':
        // 粒子排序：最旧的在前面
        for (let i = count - 1; i >= 0; i--) {
          elements[i].draw(vi)
          vi += 20
        }
        break
      case 'by-scale-factor': {
        // 粒子排序：近大远小
        const {min, abs, round} = Math
        const layers = ParticleLayer.layers
        const starts = ParticleLayer.zeros
        const ends = ParticleLayer.sharedUint32A
        const set = ParticleLayer.sharedUint32B
        const times = 0x3ffff / 10
        let li = 0
        let si = 2
        for (let i = 0; i < count; i++) {
          const element = elements[i]
          // 使用缩放系数来计算排序优先级，作为键
          const key = min(0x3ffff, round(
            abs(element.scaleFactor) * times
          ))
          if (starts[key] === 0) {
            // 如果当前键没有粒子
            starts[key] = si
            layers[li++] = key
          } else {
            // 已存在相同优先级的粒子
            // 添加到set的下一个位置
            set[ends[key] + 1] = si
          }
          ends[key] = si
          set[si++] = i
          set[si++] = 0
        }
        // 借助类型化数组对键(优先级)进行排序
        const queue = new Uint32Array(layers.buffer, 0, li).sort()
        for (let i = 0; i < li; i++) {
          // 通过排序后的键来获取粒子
          const key = queue[i]
          let si = starts[key]
          starts[key] = 0
          do {
            elements[set[si]].draw(vi)
            vi += 20
          } while ((si = set[si + 1]) !== 0)
        }
        break
      }
    }

    // 绘制图像
    if (vi !== 0) {
      gl.alpha = this.emitter.opacity
      gl.blend = data.blend
      const program = gl.particleProgram.use()
      const vertices = gl.arrays[0].float32
      if (matrix === undefined) {
        matrix = gl.matrix.project(
          gl.flip,
          gl.width,
          gl.height,
        )
        .scale(Camera.zoom, Camera.zoom)
        .translate(-Camera.scrollLeft, -Camera.scrollTop)
      }
      gl.bindVertexArray(program.vao)
      gl.uniformMatrix3fv(program.u_Matrix, false, matrix)
      switch (data.color.mode) {
        default:
          // 颜色模式：纯色
          gl.uniform1i(program.u_Mode, 0)
          break
        case 'texture': {
          // 颜色模式：纹理采样
          const tint = data.color.tint
          const red = tint[0] / 255
          const green = tint[1] / 255
          const blue = tint[2] / 255
          const gray = tint[3] / 255
          gl.uniform1i(program.u_Mode, 1)
          gl.uniform4f(program.u_Tint, red, green, blue, gray)
          break
        }
      }
      const lightMode = ParticleLayer.lightSamplingModes[data.light]
      gl.uniform1i(program.u_LightMode, lightMode)
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW, 0, vi)
      gl.bindTexture(gl.TEXTURE_2D, texture.base.glTexture)
      gl.drawElements(gl.TRIANGLES, vi / 20 * 6, gl.UNSIGNED_INT, 0)
      gl.alpha = 1
    }
  }

  /** 加载粒子纹理 */
  loadTexture() {
    const guid = this.data.image
    if (guid) {
      const texture = new ImageTexture(guid)
      // 如果纹理已完成加载，设置好参数直接返回
      if (texture.complete) {
        this.texture = texture
        this.calculateElementSize()
        return
      }
      this.texture = texture
      texture.on('load', () => {
        if (this.texture === texture) {
          // 纹理加载结束后如果粒子层还存在
          // 设置参数，并恢复默认draw函数
          this.texture = texture
          this.calculateElementSize()
          delete this.draw
        } else {
          // 如果粒子层已销毁，则销毁纹理
          texture.destroy()
        }
      })
    }
    // 加载完成前禁用draw函数
    this.draw = Function.empty
  }

  /** 计算粒子元素大小 */
  calculateElementSize() {
    const {data, texture} = this
    this.textureWidth = texture.width
    this.textureHeight = texture.height
    this.unitWidth = Math.floor(texture.width / data.hframes)
    this.unitHeight = Math.floor(texture.height / data.vframes)
  }

  /** 更新可发射的粒子数量 */
  updateCount() {
    let {count} = this.data
    // 如果发射数量为0，表示可以无限发射
    if (count === 0) {
      count = 1e16
    }
    this.count = count
    this.stocks = count
  }

  /** 更新过渡映射表 */
  updateEasing() {
    const {color} = this.data
    if (color.mode === 'easing') {
      this.easing = Easing.get(color.easingId)
    }
  }

  /** 销毁图层中的粒子纹理 */
  destroy() {
    if (this.texture instanceof ImageTexture) {
      this.texture.destroy()
      this.texture = null
    }
  }

  // 静态 - 同时存在的最大粒子数量
  static maximum = 1000

  // 静态 - 图层数组
  static layers = new Uint32Array(0x40000)

  // 静态 - 零值数组(用完后要确保所有值归零)
  static zeros = new Uint32Array(0x40000)

  // 静态 - 共享数组
  static sharedUint32A = new Uint32Array(GL.arrays[0].uint32.buffer, 512 * 512 * 88, 512 * 512)
  static sharedUint32B = new Uint32Array(GL.arrays[0].uint32.buffer, 512 * 512 * 92, 512 * 512)

  // 静态 - 光照采样模式映射表
  static lightSamplingModes = {raw: 0, global: 1, ambient: 2}
}

// ******************************** 粒子元素类 ********************************

class ParticleElement {
  /** 绑定的粒子发射器对象
   *  @type {ParticleEmitter}
   */ emitter

  /** 绑定的粒子图层对象
   *  @type {ParticleLayer}
   */ layer

  /** 粒子图层数据
   *  @type {Object}
   */ data

  /** 粒子已播放时间
   *  @type {number}
   */ elapsed

  /** 粒子的生存周期
   *  @type {number}
   */ lifetime

  /** 粒子渐出持续时间
   *  @type {number}
   */ fadeout

  /** 粒子渐出的时间点
   *  @type {number}
   */ fadeoutTime

  /** 粒子全局角度
   *  @type {number}
   */ globalAngle

  /** 粒子的水平位置
   *  @type {number}
   */ x

  /** 粒子的垂直位置
   *  @type {number}
   */ y

  /** 粒子的水平锚点位置
   *  @type {number}
   */ anchorX

  /** 粒子的垂直锚点位置
   *  @type {number}
   */ anchorY

  /** 粒子的水平锚点速度
   *  @type {number}
   */ anchorSpeedX

  /** 粒子的垂直锚点速度
   *  @type {number}
   */ anchorSpeedY

  /** 粒子的水平移动速度
   *  @type {number}
   */ movementSpeedX

  /** 粒子的垂直移动速度
   *  @type {number}
   */ movementSpeedY

  /** 粒子的水平移动加速度
   *  @type {number}
   */ movementAccelX

  /** 粒子的垂直移动加速度
   *  @type {number}
   */ movementAccelY

  /** 粒子的旋转角度
   *  @type {number}
   */ rotationAngle

  /** 粒子的旋转速度
   *  @type {number}
   */ rotationSpeed

  /** 粒子的旋转加速度
   *  @type {number}
   */ rotationAccel

  /** 粒子的水平旋转偏移X
   *  @type {number}
   */ hRotationOffsetX

  /** 粒子的水平旋转偏移Y
   *  @type {number}
   */ hRotationOffsetY

  /** 粒子的水平旋转半径
   *  @type {number}
   */ hRotationRadius

  /** 粒子的水平旋转半径扩张速度
   *  @type {number}
   */ hRotationExpansionSpeed

  /** 粒子的水平旋转半径扩张加速度
   *  @type {number}
   */ hRotationExpansionAccel

  /** 粒子的水平旋转角度
   *  @type {number}
   */ hRotationAngle

  /** 粒子的水平旋转角速度
   *  @type {number}
   */ hRotationAngularSpeed

  /** 粒子的水平旋转角加速度
   *  @type {number}
   */ hRotationAngularAccel

  /** 粒子的缩放系数
   *  @type {number}
   */ scaleFactor

  /** 粒子的缩放速度
   *  @type {number}
   */ scaleSpeed

  /** 粒子的缩放加速度
   *  @type {number}
   */ scaleAccel

  /** 粒子精灵的水平索引
   *  @type {number}
   */ hindex

  /** 粒子精灵的垂直索引
   *  @type {number}
   */ vindex

  /** 粒子的不透明度
   *  @type {number}
   */ opacity

  /** 粒子的颜色数组
   *  @type {Array<number>}
   */ color

  /** 粒子设置初始位置函数
   *  @type {Function}
   */ setStartPosition

  /** 粒子后期处理函数
   *  @type {Function}
   */ postProcessing

  /** 粒子设置初始颜色函数
   *  @type {Function}
   */ setStartColor

  /** 粒子更新颜色函数
   *  @type {Function}
   */ updateColor

  /**
   * 粒子元素对象
   * @param {ParticleLayer} layer 绑定的粒子图层对象
   */
  constructor(layer) {
    this.emitter = layer.emitter
    this.layer = layer
    this.data = layer.data
    this.elapsed = 0
    this.lifetime = 0
    this.fadeout = 0
    this.fadeoutTime = 0
    this.globalAngle = 0
    this.x = 0
    this.y = 0
    this.anchorX = 0
    this.anchorY = 0
    this.anchorSpeedX = 0
    this.anchorSpeedY = 0
    this.movementSpeedX = 0
    this.movementSpeedY = 0
    this.movementAccelX = 0
    this.movementAccelY = 0
    this.rotationAngle = 0
    this.rotationSpeed = 0
    this.rotationAccel = 0
    this.hRotationOffsetX = 0
    this.hRotationOffsetY = 0
    this.hRotationRadius = 0
    this.hRotationExpansionSpeed = 0
    this.hRotationExpansionAccel = 0
    this.hRotationAngle = 0
    this.hRotationAngularSpeed = 0
    this.hRotationAngularAccel = 0
    this.scaleFactor = 0
    this.scaleSpeed = 0
    this.scaleAccel = 0
    this.hindex = 0
    this.vindex = 0
    this.opacity = 0
    this.color = new Uint32Array(5)
    this.updateMethods()
    this.initialize()
  }

  /** 初始化粒子元素 */
  initialize() {
    const {emitter} = this
    const {lifetime, lifetimeDev, fadeout, anchor, rotation, hRotation, movement, scale, hframes, vframes} = this.data

    // 计算初始属性
    this.elapsed = 0
    this.lifetime = lifetime + lifetimeDev * (Math.random() * 2 - 1)
    this.fadeout = fadeout
    this.fadeoutTime = this.lifetime - fadeout
    this.globalAngle = emitter.angle
    this.scaleFactor = ParticleElement.getRandomParameter(scale.factor) * emitter.scale
    this.scaleSpeed = ParticleElement.getRandomParameter(scale.speed) / 1e3 * emitter.scale
    this.scaleAccel = ParticleElement.getRandomParameter(scale.accel) / 1e6 * emitter.scale
    this.anchorX = ParticleElement.getRandomParameter(anchor.x)
    this.anchorY = ParticleElement.getRandomParameter(anchor.y)
    this.anchorSpeedX = ParticleElement.getRandomParameter(anchor.speedX) / 1e3
    this.anchorSpeedY = ParticleElement.getRandomParameter(anchor.speedY) / 1e3
    this.rotationAngle = Math.radians(ParticleElement.getRandomParameter(rotation.angle)) + emitter.angle
    this.rotationSpeed = Math.radians(ParticleElement.getRandomParameter(rotation.speed)) / 1e3
    this.rotationAccel = Math.radians(ParticleElement.getRandomParameter(rotation.accel)) / 1e6
    this.hRotationOffsetX = 0
    this.hRotationOffsetY = 0
    this.hRotationRadius = ParticleElement.getRandomParameter(hRotation.radius) * emitter.scale
    this.hRotationExpansionSpeed = ParticleElement.getRandomParameter(hRotation.expansionSpeed) * emitter.scale / 1e3
    this.hRotationExpansionAccel = ParticleElement.getRandomParameter(hRotation.expansionAccel) * emitter.scale / 1e6
    this.hRotationAngle = Math.radians(ParticleElement.getRandomParameter(hRotation.angle))
    this.hRotationAngularSpeed = Math.radians(ParticleElement.getRandomParameter(hRotation.angularSpeed)) / 1e3
    this.hRotationAngularAccel = Math.radians(ParticleElement.getRandomParameter(hRotation.angularAccel)) / 1e6
    const movementAngle = Math.radians(ParticleElement.getRandomParameter(movement.angle)) + emitter.angle
    const movementSpeed = ParticleElement.getRandomParameter(movement.speed) * emitter.scale / 1e3
    this.movementSpeedX = movementSpeed * Math.cos(movementAngle)
    this.movementSpeedY = movementSpeed * Math.sin(movementAngle)
    const movementAccelAngle = Math.radians(ParticleElement.getRandomParameter(movement.accelAngle)) + emitter.angle
    const movementAccel = ParticleElement.getRandomParameter(movement.accel) * emitter.scale / 1e6
    this.movementAccelX = movementAccel * Math.cos(movementAccelAngle)
    this.movementAccelY = movementAccel * Math.sin(movementAccelAngle)
    const frame = Math.floor(Math.random() * hframes * vframes)
    this.hindex = frame % hframes
    this.vindex = Math.floor(frame / hframes)
    this.opacity = 1

    // 设置初始位置
    this.setStartPosition(movementAngle)

    // 设置初始颜色
    this.setStartColor()
  }

  /**
   * 更新粒子的运动
   * @param {number} deltaTime 增量时间(毫秒)
   * @returns {boolean} 返回false表示粒子可以被回收
   */
  update(deltaTime) {
    // 计算当前帧新的粒子位置
    this.elapsed += deltaTime
    this.scaleSpeed += this.scaleAccel * deltaTime
    this.scaleFactor += this.scaleSpeed * deltaTime
    this.rotationSpeed += this.rotationAccel * deltaTime
    this.rotationAngle += this.rotationSpeed * deltaTime
    this.movementSpeedX += this.movementAccelX * deltaTime
    this.movementSpeedY += this.movementAccelY * deltaTime
    this.anchorX += this.anchorSpeedX * deltaTime
    this.anchorY += this.anchorSpeedY * deltaTime
    this.x += this.movementSpeedX * deltaTime
    this.y += this.movementSpeedY * deltaTime

    // 计算水平旋转
    this.hRotationExpansionSpeed += this.hRotationExpansionAccel * deltaTime
    this.hRotationRadius += this.hRotationExpansionSpeed * deltaTime
    this.hRotationAngularSpeed += this.hRotationAngularAccel * deltaTime
    this.hRotationAngle += this.hRotationAngularSpeed * deltaTime
    const hRotationOffset = this.hRotationRadius * Math.cos(this.hRotationAngle)
    const hRotationOffsetX = hRotationOffset * Math.cos(this.globalAngle)
    const hRotationOffsetY = hRotationOffset * Math.sin(this.globalAngle)
    this.x += hRotationOffsetX - this.hRotationOffsetX
    this.y += hRotationOffsetY - this.hRotationOffsetY
    this.hRotationOffsetX = hRotationOffsetX
    this.hRotationOffsetY = hRotationOffsetY

    // 更新颜色
    this.updateColor()

    // 后期处理
    return this.postProcessing()
  }

  /**
   * 绘制粒子的精灵图像
   * @param {number} vi 顶点数组的起始索引位置
   */
  draw(vi) {
    const layer = this.layer
    const sw = layer.unitWidth
    const sh = layer.unitHeight
    const tw = layer.textureWidth
    const th = layer.textureHeight
    const ax = this.anchorX + 0.5
    const ay = this.anchorY + 0.5
    const vertices = GL.arrays[0].float32
    const colors = GL.arrays[0].uint32
    const matrix = GL.matrix.reset()
    .translate(this.x, this.y)
    .rotate(this.rotationAngle)
    .scale(this.scaleFactor, this.scaleFactor)
    .translate(-ax * sw, -ay * sh)
    const R = sw
    const B = sh
    const a = matrix[0]
    const b = matrix[1]
    const c = matrix[3]
    const d = matrix[4]
    const e = matrix[6]
    const f = matrix[7]
    const sx = this.hindex * sw
    const sy = this.vindex * sh
    const color = this.getColorInt()
    const sl = sx / tw
    const st = sy / th
    const sr = (sx + sw) / tw
    const sb = (sy + sh) / th
    vertices[vi    ] = e
    vertices[vi + 1] = f
    vertices[vi + 2] = sl
    vertices[vi + 3] = st
    colors  [vi + 4] = color
    vertices[vi + 5] = c * B + e
    vertices[vi + 6] = d * B + f
    vertices[vi + 7] = sl
    vertices[vi + 8] = sb
    colors  [vi + 9] = color
    vertices[vi + 10] = a * R + c * B + e
    vertices[vi + 11] = b * R + d * B + f
    vertices[vi + 12] = sr
    vertices[vi + 13] = sb
    colors  [vi + 14] = color
    vertices[vi + 15] = a * R + e
    vertices[vi + 16] = b * R + f
    vertices[vi + 17] = sr
    vertices[vi + 18] = st
    colors  [vi + 19] = color
  }

  /**
   * 获取整数型颜色
   * @returns {Uint32Array} 粒子颜色
   */
  getColorInt() {
    const {color} = this
    if (color.changed) {
      color.changed = false
      const r = color[0]
      const g = color[1]
      const b = color[2]
      const a = Math.round(color[3] * this.opacity)
      // 将RGBA生成的整数型颜色代码存放在color[4]中
      color[4] = r + (g + (b + a * 256) * 256) * 256
    }
    return color[4]
  }

  /** 更新粒子方法(根据粒子的特性来设置) */
  updateMethods() {
    const {area, color} = this.data
    // 给不同的发射区域设置特有的方法
    switch (area.type) {
      case 'point':
        this.setStartPosition = this.setStartPositionPoint
        this.postProcessing = this.postProcessingCommon
        break
      case 'rectangle':
        this.setStartPosition = this.setStartPositionRectangle
        this.postProcessing = this.postProcessingCommon
        break
      case 'circle':
        this.setStartPosition = this.setStartPositionCircle
        this.postProcessing = this.postProcessingCommon
        break
      case 'edge':
        this.setStartPosition = this.setStartPositionEdge
        this.postProcessing = this.postProcessingEdge
        break
    }
    // 给不同的颜色模式设置特有的方法
    switch (color.mode) {
      case 'fixed':
        this.setStartColor = this.setStartColorFixed
        this.updateColor = Function.empty
        break
      case 'random':
        this.setStartColor = this.setStartColorRandom
        this.updateColor = Function.empty
        break
      case 'easing':
        if (this.color.start === undefined) {
          this.color.start = new Uint8Array(4)
          this.color.end = new Uint8Array(4)
        }
        this.setStartColor = this.setStartColorEasing
        this.updateColor = this.updateColorEasing
        break
      case 'texture':
        this.setStartColor = this.setStartColorTexture
        this.updateColor = Function.empty
        break
    }
  }

  /** 变换粒子的初始位置 */
  transformStartPosition() {
    const {matrix} = this.emitter
    // 如果发射器中存在矩阵，变换位置
    if (matrix !== null) {
      const a = matrix[0]
      const b = matrix[1]
      const c = matrix[3]
      const d = matrix[4]
      const e = matrix[6]
      const f = matrix[7]
      const {x, y} = this
      this.x = a * x + c * y + e
      this.y = b * x + d * y + f
    }
  }

  /** 获取区域位置 */
  getAreaPosition() {
    const array = ParticleElement.sharedFloat64Array
    const emitter = this.emitter
    const area = this.data.area
    const cos = Math.cos(emitter.angle)
    const sin = Math.sin(emitter.angle)
    const x = area.x * emitter.scale
    const y = area.y * emitter.scale
    array[0] = x * cos - y * sin
    array[1] = x * sin + y * cos
    return array
  }

  /** 设置初始位置 - 点发射区域 */
  setStartPositionPoint() {
    const {emitter} = this
    const pos = this.getAreaPosition()
    this.x = emitter.startX + pos[0]
    this.y = emitter.startY + pos[1]
    this.transformStartPosition()
  }

  /** 设置初始位置 - 矩形发射区域 */
  setStartPositionRectangle() {
    const {emitter} = this
    const {area} = this.data
    const pos = this.getAreaPosition()
    const x = emitter.startX + pos[0]
    const y = emitter.startY + pos[1]
    const wh = area.width * emitter.scale / 2
    const hh = area.height * emitter.scale / 2
    this.x = Math.randomBetween(x - wh, x + wh)
    this.y = Math.randomBetween(y - hh, y + hh)
    this.transformStartPosition()
  }

  /** 设置初始位置 - 圆形发射区域 */
  setStartPositionCircle() {
    const {emitter} = this
    const {area} = this.data
    const pos = this.getAreaPosition()
    const x = emitter.startX + pos[0]
    const y = emitter.startY + pos[1]
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * area.radius * emitter.scale
    this.x = x + distance * Math.cos(angle)
    this.y = y + distance * Math.sin(angle)
    this.transformStartPosition()
  }

  /**
   * 设置初始位置 - 屏幕边缘发射区域
   * @param {number} movementAngle 初始移动角度(弧度)
   */
  setStartPositionEdge(movementAngle) {
    // 计算屏幕边缘的位置
    const scrollLeft = Camera.scrollLeft
    const scrollTop = Camera.scrollTop
    const scrollRight = Camera.scrollRight
    const scrollBottom = Camera.scrollBottom
    const width = scrollRight - scrollLeft
    const height = scrollBottom - scrollTop
    const weightX = Math.abs(Math.sin(movementAngle) * width)
    const weightY = Math.abs(Math.sin(movementAngle - Math.PI / 2) * height)
    const threshold = weightX / (weightX + weightY)
    const random = Math.random()
    if (random < threshold) {
      // 从屏幕水平位置(上边或下边)生成粒子
      const forward = this.movementSpeedY >= 0
      this.x = scrollLeft + random / threshold * width
      this.y = forward ? scrollTop : scrollBottom
      const vertices = this.getBoundingRectangle()
      this.x -= (vertices[0] + vertices[2]) / 2 - this.x
      this.y -= forward
      ? vertices[3] - this.y
      : vertices[1] - this.y
    } else {
      // 从屏幕垂直位置(左边或右边)生成粒子
      const forward = this.movementSpeedX >= 0
      this.y = scrollTop + (random - threshold) / (1 - threshold) * height
      this.x = forward ? scrollLeft : scrollRight
      const vertices = this.getBoundingRectangle()
      this.y -= (vertices[1] + vertices[3]) / 2 - this.y
      this.x -= forward
      ? vertices[2] - this.x
      : vertices[0] - this.x
    }
  }

  /**
   * 后期处理 - 通用发射区域
   * @returns {boolean} 返回false表示粒子可以被回收
   */
  postProcessingCommon() {
    // 粒子已到达生命周期，返回false(进行回收)
    if (this.elapsed >= this.lifetime) {
      return false
    }

    // 粒子已到达淡出时间，计算不透明度
    if (this.elapsed > this.fadeoutTime) {
      const elapsed = this.elapsed - this.fadeoutTime
      const time = elapsed / this.fadeout
      this.opacity = Math.max(1 - time, 0)
      this.color.changed = true
    }
    return true
  }

  /**
   * 后期处理 - 屏幕边缘发射区域
   * @returns {boolean} 返回false表示粒子可以被回收
   */
  postProcessingEdge() {
    // 粒子处于屏幕内的情况
    const vertices = this.getBoundingRectangle()
    if (vertices[0] < Camera.scrollRight &&
      vertices[1] < Camera.scrollBottom &&
      vertices[2] > Camera.scrollLeft &&
      vertices[3] > Camera.scrollTop &&
      this.elapsed < this.lifetime) {
      // 标记为已经出现的状态
      this.appeared = true

      // 粒子已到达淡出时间，计算不透明度
      if (this.elapsed > this.fadeoutTime) {
        const elapsed = this.elapsed - this.fadeoutTime
        const time = elapsed / this.fadeout
        this.opacity = Math.max(1 - time, 0)
        this.color.changed = true
      }
      return true
    }

    // 粒子处于屏幕外的情况
    // 若是粒子已经出现过(刚生成可能在屏幕外，给它一个出场的机会)
    // 或者时间超过500ms或生命周期
    // 则返回false(进行回收)
    if (this.appeared ||
      this.elapsed > 500 ||
      this.elapsed >= this.lifetime) {
      this.appeared = false
      return false
    }
    return true
  }

  /**
   * 获取粒子元素的外接矩形
   * @returns {Float64Array} [minX, minY, maxX, maxY]
   */
  getBoundingRectangle() {
    const layer = this.layer
    const sw = layer.unitWidth
    const sh = layer.unitHeight
    const ax = this.anchorX + 0.5
    const ay = this.anchorY + 0.5
    const matrix = GL.matrix.reset()
    .translate(this.x, this.y)
    .rotate(this.rotationAngle)
    .scale(this.scaleFactor, this.scaleFactor)
    .translate(-ax * sw, -ay * sh)
    const R = sw
    const B = sh
    const a = matrix[0]
    const b = matrix[1]
    const c = matrix[3]
    const d = matrix[4]
    const e = matrix[6]
    const f = matrix[7]
    const x1 = e
    const y1 = f
    const x2 = c * B + e
    const y2 = d * B + f
    const x3 = a * R + c * B + e
    const y3 = b * R + d * B + f
    const x4 = a * R + e
    const y4 = b * R + f
    const vertices = ParticleElement.sharedFloat64Array
    vertices[0] = Math.min(x1, x2, x3, x4)
    vertices[1] = Math.min(y1, y2, y3, y4)
    vertices[2] = Math.max(x1, x2, x3, x4)
    vertices[3] = Math.max(y1, y2, y3, y4)
    return vertices
  }

  /** 设置初始颜色 - 固定 */
  setStartColorFixed() {
    const {rgba} = this.data.color
    const {color} = this
    color.changed = true
    color[0] = rgba[0]
    color[1] = rgba[1]
    color[2] = rgba[2]
    color[3] = rgba[3]
  }

  /** 设置初始颜色 - 随机 */
  setStartColorRandom() {
    const {min, max} = this.data.color
    const {color} = this
    color.changed = true
    color[0] = Math.randomBetween(min[0], max[0])
    color[1] = Math.randomBetween(min[1], max[1])
    color[2] = Math.randomBetween(min[2], max[2])
    color[3] = Math.randomBetween(min[3], max[3])
  }

  /** 设置初始颜色 - 过渡 */
  setStartColorEasing() {
    const {startMin, startMax, endMin, endMax} = this.data.color
    const {start, end} = this.color
    start[0] = Math.randomBetween(startMin[0], startMax[0])
    start[1] = Math.randomBetween(startMin[1], startMax[1])
    start[2] = Math.randomBetween(startMin[2], startMax[2])
    start[3] = Math.randomBetween(startMin[3], startMax[3])
    end[0] = Math.randomBetween(endMin[0], endMax[0])
    end[1] = Math.randomBetween(endMin[1], endMax[1])
    end[2] = Math.randomBetween(endMin[2], endMax[2])
    end[3] = Math.randomBetween(endMin[3], endMax[3])
  }

  /** 更新颜色 - 过渡 */
  updateColorEasing() {
    const {easing} = this.layer
    const {color} = this
    const {start, end} = color
    const clamp = ParticleElement.sharedClampedArray
    const time = Math.min(easing.map(this.elapsed / this.lifetime), 1)
    color.changed = true
    // 使用clamped数组限制过渡插值的颜色范围(0-255)
    clamp[0] = start[0] * (1 - time) + end[0] * time
    clamp[1] = start[1] * (1 - time) + end[1] * time
    clamp[2] = start[2] * (1 - time) + end[2] * time
    clamp[3] = start[3] * (1 - time) + end[3] * time
    color[0] = clamp[0]
    color[1] = clamp[1]
    color[2] = clamp[2]
    color[3] = clamp[3]
  }

  /** 设置初始颜色 - 纹理采样 */
  setStartColorTexture() {
    const {color} = this
    color.changed = true
    color[3] = 255
  }

  // 静态属性
  static count = 0
  static sharedFloat64Array = new Float64Array(4)
  static sharedClampedArray = new Uint8ClampedArray(4)

  // 生成随机参数
  static getRandomParameter([standard, deviation]) {
    return standard + deviation * (Math.random() * 2 - 1)
  }
}

// ******************************** 粒子发射器列表类 ********************************

class ParticleEmitterList extends Array {
  /**
   * 添加粒子发射器到管理器中
   * @param {ParticleEmitter} emitter 粒子发射器
   */
  append(emitter) {
    if (emitter.parent === null) {
      emitter.parent = this
      this.push(emitter)
    }
  }

  /**
   * 从管理器中移除粒子发射器
   * @param {ParticleEmitter} emitter 粒子发射器
   */
  remove(emitter) {
    if (emitter.parent === this) {
      emitter.parent = null
      super.remove(emitter)
    }
  }

  /**
   * 更新粒子发射器
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    const length = this.length
    for (let i = 0; i < length; i++) {
      this[i].update(deltaTime)
    }
  }

  /**
   * 绘制粒子
   * @param {Matrix} [matrix] 投影矩阵
   */
  draw(matrix) {
    for (const emitter of this) {
      emitter.draw(matrix)
    }
  }

  /** 销毁管理器中的粒子发射器 */
  destroy() {
    const length = this.length
    for (let i = 0; i < length; i++) {
      this[i].destroy()
    }
  }
}