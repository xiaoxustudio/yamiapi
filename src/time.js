'use strict'

// ******************************** 游戏时间对象 ********************************

const Time = new class {
  /** 时间戳 */
  timestamp = 0

  /** 时间缩放率 */
  timeScale = 1

  /** 已过去时间 */
  elapsed = 0

  /** 累计游戏时间 */
  playTime = 0

  /** 增量时间 */
  deltaTime = 0

  /** 原生增量时间 */
  rawDeltaTime = 0

  /** 最大增量时间 */
  maxDeltaTime = 35

  /** 累计帧数 */
  frameCount = 0

  /** 累计帧时间 */
  frameTime = 0

  /** 每秒游戏帧数 */
  fps = 0

  /** 平均每帧游戏时间 */
  tpf = Infinity

  // 游戏速度过渡结束后回调
  _callbacks = null

  // 游戏速度过渡上下文
  _transition = null

  /** 初始化游戏时间管理器 */
  initialize() {
    this.timestamp = performance.now()
  }

  /** 重置游戏时间管理器 */
  reset() {
    this.timeScale = 1
    this.playTime = 0
    this._callbacks = null
    this._transition = null
  }

  /**
   * 更新当前帧的时间相关参数
   * @param {number} timestamp 增量时间(毫秒)
   */
  update(timestamp) {
    let deltaTime = timestamp - this.timestamp

    // 累计帧数和所用时间
    this.frameCount++
    this.frameTime += deltaTime

    // 每秒计算FPS
    if (this.frameTime > 995) {
      this.fps = Math.round(this.frameCount / (this.frameTime / 1000))
      this.tpf = this.frameTime / this.frameCount
      this.frameCount = 0
      this.frameTime = 0
    }

    // 限制增量时间 - 发生跳帧时减少视觉上的落差
    deltaTime = Math.min(deltaTime, this.tpf + 1, this.maxDeltaTime)

    // 计算游戏速度改变时的过渡
    const _transition = this._transition
    if (_transition !== null) {
      _transition.elapsed = Math.min(
        _transition.elapsed + deltaTime,
        _transition.duration,
      )
      const {start, end, easing, elapsed, duration} = _transition
      const time = easing.map(elapsed / duration)
      this.timeScale = start * (1 - time) + end * time
      // 过渡结束后执行回调
      if (elapsed === duration) {
        this._transition = null
        this.executeCallbacks()
      }
    }

    // 更新时间属性
    this.timestamp = timestamp
    this.deltaTime = this.timeScale * deltaTime
    this.rawDeltaTime = deltaTime
    this.elapsed += this.deltaTime
    this.playTime += deltaTime
  }

  /**
   * 设置增量时间缩放比例
   * @param {number} timeScale 增量时间缩放比例
   * @param {string} easingId 过渡曲线ID
   * @param {number} duration 持续时间(毫秒)
   */
  setTimeScale(timeScale, easingId, duration) {
    if (duration > 0) {
      // 过渡模式
      this._transition = {
        start: this.timeScale,
        end: timeScale,
        easing: Easing.get(easingId),
        elapsed: 0,
        duration: duration,
      }
    } else {
      // 立即模式
      this.timeScale = timeScale
      this._transition = null
      this.executeCallbacks()
    }
  }

  /**
   * 解析日期时间戳
   * @param {number} timestamp 时间戳
   * @param {string} format 日期格式
   * @returns {string}
   */
  parseDateTimestamp(timestamp, format) {
    const date = new Date(timestamp)
    return format.replace(/\{[YMDhms]\}/g, match => {
      switch (match) {
        case '{Y}': return date.getFullYear()
        case '{M}': return date.getMonth() + 1
        case '{D}': return date.getDate()
        case '{h}': return date.getHours().toString().padStart(2, '0')
        case '{m}': return date.getMinutes().toString().padStart(2, '0')
        case '{s}': return date.getSeconds().toString().padStart(2, '0')
      }
    })
  }

  /**
   * 设置时间缩放过渡结束回调
   * @param {function} callback 回调函数
   */
  onTransitionEnd(callback) {
    if (this._callbacks !== null) {
      this._callbacks.push(callback)
    } else {
      this._callbacks = [callback]
    }
  }

  /** 执行时间缩放过渡结束回调 */
  executeCallbacks() {
    if (this._callbacks !== null) {
      for (const callback of this._callbacks) {
        callback()
      }
      this._callbacks = null
    }
  }
}

// ******************************** 计时器 ********************************

class Timer {
  /** 计时器当前时间
   *  @type {number}
   */ elapsed

  /** 计时器持续时间
   *  @type {number}
   */ duration

  /** 计时器更新函数
   *  @type {Function}
   */ update

  /** 计时器结束回调函数
   *  @type {Function}
   */ callback

  /**
   * 计时器对象
   * @param {Object} options 选项
   * @param {number} options.duration 持续时间
   * @param {function} [options.update] 更新回调
   * @param {function} [options.callback] 结束回调
   */
  constructor({duration, update, callback}) {
    this.elapsed = 0
    this.duration = duration
    this.update = update ?? Function.empty
    this.callback = callback ?? Function.empty
  }

  /**
   * 执行周期回调函数
   * @param {number} deltaTime 增量时间(毫秒)
   */
  tick(deltaTime) {
    this.elapsed = Math.min(this.elapsed + deltaTime, this.duration)
    this.update(this)
    if (this.elapsed === this.duration) {
      this.callback(this)
      this.remove()
    }
  }

  /**
   * 添加计时器到列表
   * @returns {Timer}
   */
  add() {
    Timer.timers.append(this)
    return this
  }

  /**
   * 从列表中移除计时器
   * @returns {Timer}
   */
  remove() {
    Timer.timers.remove(this)
    return this
  }

  // 计时器列表
  static timers = []

  /**
   * 更新计时器
   * @param {number} deltaTime 增量时间(毫秒)
   */
  static update(deltaTime) {
    const {timers} = this
    let i = timers.length
    while (--i >= 0) {
      timers[i].tick(deltaTime)
    }
  }

  /**
   * 等待游戏时间(未使用)
   * @param {number} duration 持续时间(毫秒)
   * @returns {Promise<undefined>}
   */
  static wait(duration) {
    return new Promise(resolve => {
      new Timer({duration, callback() {resolve()}}).add()
    })
  }

  /**
   * 等待原生时间(未使用)
   * @param {number} duration 持续时间(毫秒)
   * @returns {Promise<undefined>}
   */
  static waitRaw(duration) {
    return new Promise(resolve => {
      setTimeout(resolve, duration)
    })
  }
}

// ******************************** 过渡曲线管理器 ********************************

const Easing = new class {
  // 曲线映射表刻度(精度)
  scale = 10000
  startPoint = {x: 0, y: 0}
  endPoint = {x: 1, y: 1}
  remap = {}
  easingMaps = {}
  linear = {map: a => a}

  /** 初始化 */
  initialize() {
    this.remap = Data.easings.remap
  }

  /**
   * 获取过渡曲线映射表
   * @param {string} key 过渡曲线ID或键
   * @returns {EasingMap}
   */
  get(key) {
    // 返回缓存映射表
    const id = this.remap[key]
    const map = this.easingMaps[id]
    if (map) return map

    // 创建新的映射表
    const easing = Data.easings[id]
    if (easing) {
      return this.easingMaps[id] = new EasingMap(
        this.startPoint, ...easing.points, this.endPoint,
      )
    }

    // 返回缺省值(线性)
    return this.linear
  }
}

// 过渡曲线映射表类
class EasingMap extends Float32Array {
  /**
   * 过渡曲线映射表
   * @param  {...{x: number, y: number}} points 控制点列表
   */
  constructor(...points) {
    const scale = Easing.scale
    super(scale + 1)
    const length = points.length - 1
    let pos = -1
    // 生成过渡曲线，键值对(X，Y)写入映射表
    for (let i = 0; i < length; i += 3) {
      const {x: x0, y: y0} = points[i]
      const {x: x1, y: y1} = points[i + 1]
      const {x: x2, y: y2} = points[i + 2]
      const {x: x3, y: y3} = points[i + 3]
      for (let n = 0; n <= scale; n++) {
        const t0 = n / scale
        const t1 = 1 - t0
        const n0 = t1 ** 3
        const n1 = 3 * t0 * t1 ** 2
        const n2 = 3 * t0 ** 2 * t1
        const n3 = t0 ** 3
        const x = x0 * n0 + x1 * n1 + x2 * n2 + x3 * n3
        const i = Math.round(x * scale)
        if (i > pos && i <= scale) {
          const y = y0 * n0 + y1 * n1 + y2 * n2 + y3 * n3
          this[i] = y
          if (i > pos + 1) {
            for (let j = pos + 1; j < i; j++) {
              this[j] = this[pos] + (this[i] - this[pos]) * (j - pos) / (i - pos)
            }
          }
          pos = i
        }
      }
    }
    this[scale] = 1
  }

  /**
   * 映射过渡时间
   * @param {number} time 原生时间
   * @returns {number} 处理后的过渡时间
   */
  map(time) {
    return this[Math.round(Math.min(time, 1) * Easing.scale)]
  }
}