'use strict'

// ******************************** 触发器类 ********************************

class Trigger {
  /** 触发器文件ID
   *  @type {string}
   */ id

  /** 触发器文件数据
   *  @type {Object}
   */ data

  /** 触发器水平位置
   *  @type {number}
   */ x

  /** 触发器垂直位置
   *  @type {number}
   */ y

  /** 触发器上一次水平位置
   *  @type {number}
   */ lastX

  /** 触发器上一次垂直位置
   *  @type {number}
   */ lastY

  /** 触发器缩放系数
   *  @type {number}
   */ scale

  /** 触发器角度(弧度)
   *  @type {number}
   */ angle

  /** 触发器移动速度(图块/秒)
   *  @type {number}
   */ speed

  /** 触发器水平速度分量
   *  @type {number}
   */ velocityX

  /** 触发器垂直速度分量
   *  @type {number}
   */ velocityY

  /** 当前帧的增量时间(毫秒)
   *  @type {number}
   */ deltaTime

  /** 触发器的总体播放速度
   *  @type {number}
   */ timeScale

  /** 触发器已经播放的时间
   *  @type {number}
   */ elapsed

  /** 触发器的持续时间
   *  @type {number}
   */ duration

  /** 触发器的形状参数对象
   *  @type {Object}
   */ shape

  /** 触发器的动画播放器
   *  @type {Animation}
   */ animation

  /** 触发器的角色选择器规则
   *  @type {string}
   */ selector

  /** 触发次数
   *  @type {number}
   */ hitCount

  /** 触发间隔(毫秒)
   *  @type {number}
   */ hitInterval

  /** 用于启用触发器的初始延时
   *  @type {number}
   */ initialDelay

  /** 用于禁用触发器的超时时间
   *  @type {number}
   */ timeout

  /** 触发器的更新器模块列表
   *  @type {ModuleList}
   */ updaters

  /** 触发器的事件映射表
   *  @type {Object}
   */ events

  /** 触发器的脚本管理器
   *  @type {Script}
   */ script

  /** 触发器的技能施放角色
   *  @type {Actor|null}
   */ caster

  /** 触发器正在施放的技能
   *  @type {Skill|null}
   */ skill

  /** 触发器击中的角色列表
   *  @type {Array<Actor>}
   */ hitList

  /** 触发器击中角色时的时间列表
   *  @type {Array<number>}
   */ timeList

   /** 检测触发器与墙块碰撞
   *  @type {Function}
   */ detectCollisionWithWalls

  /** 通过碰撞获取角色列表
   *  @type {Function}
   */ getActorsByCollision

  /** 通过触发模式获取角色列表
   *  @type {Function}
   */ getActorsByHitMode

  /** 更新时间列表
   *  @type {Function}
   */ updateTimeList

  /** 触发器的父级对象
   *  @type {SceneTriggerList|null}
   */ parent

  /** 已开始状态
   *  @type {boolean}
   */ started

  /**
   * 触发器对象
   * @param {TriggerFile} data 触发器文件数据
   */
  constructor(data) {
    this.id = data.id
    this.data = data
    this.x = 0
    this.y = 0
    this.lastX = 0
    this.lastY = 0
    this.scale = 1
    this.angle = 0
    this.speed = data.speed
    this.velocityX = 0
    this.velocityY = 0
    this.timeScale = 1
    this.deltaTime = 0
    this.elapsed = 0
    this.duration = data.duration
    this.shape = data.shape
    this.animation = null
    this.selector = data.selector
    this.detectCollisionWithWalls = Trigger.detectCollisionWithWalls[data.onHitWalls]
    this.getActorsByCollision = Trigger.actorGetters[data.shape.type]
    this.getActorsByHitMode = Trigger.collisionFilters[data.hitMode]
    this.updateTimeList = Trigger.hitListUpdaters[data.hitMode]
    switch (data.onHitActors) {
      case 'penetrate':
        this.hitCount = Infinity
        break
      case 'destroy':
        this.hitCount = 1
        break
      case 'penetrate-destroy':
        this.hitCount = data.hitCount
        break
    }
    this.hitInterval = data.hitInterval
    this.initialDelay = data.initialDelay
    this.timeout = data.initialDelay + (data.effectiveTime || Infinity)
    this.hitList = []
    this.timeList = []
    this.updaters = new ModuleList()
    this.events = data.events
    this.script = Script.create(this, data.scripts)
    this.caster = null
    this.skill = null
    this.parent = null
    this.started = false
    this.loadAnimation(data)
    Trigger.latest = this
  }

  /**
   * 加载触发器动画
   * @param {TriggerFile} data 触发器文件数据
   */
  loadAnimation(data) {
    const animData = Data.animations[data.animationId]
    if (animData !== undefined) {
      const animation = new Animation(animData)
      animation.parent = this
      animation.scale = this.scale
      animation.setPosition(this)
      animation.priority = data.priority
      animation.offsetY = data.offsetY
      animation.setMotion(data.motion)
      animation.redirect = animation.dirMap?.length > 1
      animation.rotatable = data.rotatable
      this.animation = animation
      if (this.duration === 0) {
        // 如果触发器持续时间是0，将会使用动画的持续时间
        this.duration = animation.length * Animation.step
      }
    }
  }

  /**
   * 更新触发器的运动和碰撞检测
   * @param {number} deltaTime 增量时间(毫秒)
   */
  update(deltaTime) {
    // 如果触发器过期，移除它
    if (this.elapsed >= this.duration) {
      this.remove()
      return
    }
    const time = deltaTime * this.timeScale
    // 计算增量时间(以秒为单位)
    this.deltaTime = time
    this.elapsed += time
    this.updaters.update(deltaTime)
    this.updateMovement()
    if (this.updateCollision()) {
      // 如果未与墙壁发生碰撞，更新动画
      this.updateAnimation(time)
    } else {
      // 否则移除
      this.remove()
    }
    // 更新上一次的位置
    this.lastX = this.x
    this.lastY = this.y
  }

  /**
   * 设置触发器位置
   * @param {number} x 水平位置
   * @param {number} y 垂直位置
   */
  setPosition(x, y) {
    this.x = x
    this.y = y
    this.lastX = x
    this.lastY = y
  }

  /**
   * 设置触发器缩放系数
   * @param {number} scale 触发器缩放系数
   */
  setScale(scale) {
    this.scale = scale
    if (this.animation) {
      this.animation.scale = scale
    }
  }

  /**
   * 设置触发器角度
   * @param {number} angle 触发器角度(弧度)
   */
  setAngle(angle) {
    this.angle = angle
    this.updateVelocity()
  }

  /**
   * 设置触发器速度
   * @param {number} speed 触发器速度(图块/秒)
   */
  setSpeed(speed) {
    this.speed = speed
    this.updateVelocity()
  }

  /** 更新触发器速度分量 */
  updateVelocity() {
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)
    this.velocityX = this.speed * cos
    this.velocityY = this.speed * sin
  }

  /** 更新触发器的移动 */
  updateMovement() {
    const deltaTime = this.deltaTime / 1000
    this.x += this.velocityX * deltaTime
    this.y += this.velocityY * deltaTime
  }

  /** 更新触发器碰撞检测 */
  updateCollision() {
    // 检测与墙壁的碰撞，如果发生碰撞返回false
    if (this.detectCollisionWithWalls()) {
      return false
    }

    // 如果过去时间小于初始延时，或超时，则不会触发角色碰撞，返回true
    if (this.elapsed < this.initialDelay || this.elapsed >= this.timeout) return true

    // 获取碰撞角色列表(共享列表，用count表示长度)
    const targets = this.getActorsByCollision(this.x, this.y, this.angle, this.scale, this.shape)
    if (targets.count > 0) {
      // 通过选择器进一步筛选目标角色
      Trigger.getActorsBySelector(this.caster, this.selector)

      // 更新时间列表
      this.updateTimeList()

      // 获取命中的角色
      this.getActorsByHitMode()

      // 触发对应事件
      if (targets.count > 0) {
        const cmd1 = this.events.hitactor
        const {caster, skill} = this
        const {count} = targets
        for (let i = 0; i < count; i++) {
          const actor = targets[i]
          // 更新角色受击时间戳
          actor.updateHitTimestamp()
          const cmd2 = actor.events.hittrigger
          if (cmd2 !== undefined) {
            // 发送目标角色的击中触发器事件
            const event = new EventHandler(cmd2)
            event.triggerObject = this
            event.triggerSkill = skill
            event.triggerActor = actor
            event.casterActor = caster
            // 不需要对事件进行入栈和出栈
            // 不需要异步添加事件到更新器列表
            if (event.update() === false) {
              actor.updaters.add(event)
              event.onFinish(() => {
                Callback.push(() => {
                  actor.updaters.remove(event)
                })
              })
            }
          }
          // 同时发送脚本事件
          actor.script.emit('hittrigger', this)
          if (cmd1 !== undefined) {
            // 发送触发器的击中角色事件
            const event = new EventHandler(cmd1)
            event.triggerObject = this
            event.triggerSkill = skill
            event.triggerActor = actor
            event.casterActor = caster
            // 不需要对事件进行入栈和出栈
            // 不需要异步添加事件到更新器列表
            if (event.update() === false) {
              actor.updaters.add(event)
              event.onFinish(() => {
                Callback.push(() => {
                  actor.updaters.remove(event)
                })
              })
            }
          }
          // 同时发送脚本事件
          this.script.emit('hitactor', actor)
        }
        // 如果击中次数不够，返回false
        if ((this.hitCount -= count) <= 0) {
          return false
        }
      }
    } else {
      // 更新时间列表
      this.updateTimeList()
    }
    return true
  }

  /**
   * 更新触发器动画播放进度
   * @param {number} deltaTime 增量时间(毫秒)
   */
  updateAnimation(deltaTime) {
    const {animation} = this
    // 如果不存在动画，返回
    if (animation === null) return
    if (animation.redirect) {
      // 如果开启了动画方向计算
      this.calculateAnimDirection()
    } else if (animation.rotatable) {
      // 如果开启了动画旋转，调整旋转角度
      animation.rotation = this.angle
    }
    // 更新动画
    animation.update(deltaTime)
  }

  /** 计算触发器的动画方向 */
  calculateAnimDirection() {
    const {animation} = this
    // 设置默认动画方向为技能释放者的动画方向
    if (!animation.casterDirSync) {
      animation.casterDirSync = true
      const casterDir = this.caster.animation?.direction
      if (casterDir >= 0) {
        animation.setDirection(casterDir)
      }
    }
    // 设置触发器动画角度
    animation.setAngle(this.angle)
  }

  /** 移除触发器 */
  remove() {
    this.destroy()
    // 延迟从触发器列表中移除自己
    Callback.push(() => {
      Scene.triggers.remove(this)
    })
  }

  /**
   * 调用触发器事件
   * @param {string} type 触发器事件类型
   * @returns {EventHandler|undefined}
   */
  callEvent(type) {
    const commands = this.events[type]
    if (commands) {
      const event = new EventHandler(commands)
      event.triggerObject = this
      event.triggerSkill = this.skill
      event.triggerActor = this.caster
      event.casterActor = this.caster
      return EventHandler.call(event, this.updaters)
    }
  }

  /**
   * 调用触发器事件和脚本
   * @param {string} type 触发器事件类型
   */
  emit(type) {
    this.callEvent(type)
    this.script.emit(type, this)
  }

  // 自动执行
  autorun() {
    if (this.started === false) {
      this.started = true
      this.emit('autorun')
    }
  }

  /** 销毁触发器 */
  destroy() {
    this.emit('destroy')
    this.animation?.destroy()
  }

  // 最近创建触发器
  static latest

  // 临时角色列表
  static actors = []

  // 与角色形状发生碰撞
  static collideWithActorShape = false

  // 初始化
  static initialize() {
    this.collideWithActorShape = Data.config.collision.trigger.collideWithActorShape
  }

  /** 擦除角色缓存列表中的数据 */
  static update() {
    // 擦除角色缓存列表
    let i = 0
    const actors = this.actors
    while (actors[i] !== undefined) {
      actors[i++] = undefined
    }
  }

  /**
   * 获取指定选择器筛选的角色
   * 存放到角色缓存列表
   * @param {Actor} caster 技能施放角色
   * @param {Object} selector 选择器对象
   */
  static getActorsBySelector(caster, selector) {
    const actors = this.actors
    let count = 0
    if (caster) {
      const inspector = Actor.inspectors[selector]
      const length = actors.count
      for (let i = 0; i < length; i++) {
        const actor = actors[i]
        if (inspector(caster, actor)) {
          actors[count++] = actor
        }
      }
    }
    actors.count = count
  }

  // 触发器角色获取器
  static actorGetters = new class {
    /**
     * 获取矩形碰撞区域中的角色
     * @param {number} x 触发器位置X
     * @param {number} y 触发器位置Y
     * @param {number} angle 触发器角度(弧度)
     * @param {number} scale 触发器缩放系数
     * @param {Object} shape 触发器形状参数对象
     * @returns {Actor[]} 角色缓存列表
     */
    'rectangle' = (x, y, angle, scale, shape) => {
      let count = 0
      const targets = Trigger.actors
      const width = shape.width * scale
      const height = shape.height * scale
      const anchor = shape.anchor
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const left = -width * anchor
      const top = -height / 2
      const right = width + left
      const bottom = height / 2
      // 计算矩形触发区域的四个顶点位置
      const x1 = left * cos - top * sin
      const y1 = left * sin + top * cos
      const x2 = left * cos - bottom * sin
      const y2 = left * sin + bottom * cos
      const x3 = right * cos - top * sin
      const y3 = right * sin + top * cos
      const x4 = right * cos - bottom * sin
      const y4 = right * sin + bottom * cos
      const tl = x + Math.min(x1, x2, x3, x4)
      const tt = y + Math.min(y1, y2, y3, y4)
      const tr = x + Math.max(x1, x2, x3, x4)
      const tb = y + Math.max(y1, y2, y3, y4)
      const expansion = Trigger.collideWithActorShape ? Scene.binding.maxColliderHalf : 0
      // 获取矩形触发区域所在的角色分区列表
      const cells = Scene.actors.cells.get(
        tl - expansion,
        tt - expansion,
        tr + expansion,
        tb + expansion,
      )
      const length = cells.count
      for (let i = 0; i < length; i++) {
        const actors = cells[i]
        const length = actors.length
        for (let i = 0; i < length; i++) {
          const actor = actors[i]
          // 如果角色已激活
          if (actor.active) {
            if (Trigger.collideWithActorShape) {
              switch (actor.collider.shape) {
                case 'circle': {
                  // 计算角色的相对位置
                  const rx = actor.x - x
                  const ry = actor.y - y
                  // 以触发区域中心为锚点
                  // 逆旋转角色的相对位置
                  const ox = rx * cos + ry * sin
                  const oy = ry * cos - rx * sin
                  const closestX = Math.clamp(ox, left, right)
                  const closestY = Math.clamp(oy, top, bottom)
                  if ((ox - closestX) ** 2 + (oy - closestY) ** 2 < actor.collider.half ** 2) {
                    targets[count++] = actor
                  }
                  continue
                }
                case 'square': {
                  // 投影 - 1
                  const ah = actor.collider.half
                  if (actor.x - ah >= tr || actor.x + ah <= tl || actor.y - ah >= tb || actor.y + ah <= tt) {
                    continue
                  }
                  // 投影 - 2
                  const al = actor.x - x - ah
                  const at = actor.y - y - ah
                  const ar = actor.x - x + ah
                  const ab = actor.y - y + ah
                  const x1 = al * cos + at * sin
                  const y1 = at * cos - al * sin
                  const x2 = al * cos + ab * sin
                  const y2 = ab * cos - al * sin
                  const x3 = ar * cos + ab * sin
                  const y3 = ab * cos - ar * sin
                  const x4 = ar * cos + at * sin
                  const y4 = at * cos - ar * sin
                  const rl = Math.min(x1, x2, x3, x4)
                  const rt = Math.min(y1, y2, y3, y4)
                  const rr = Math.max(x1, x2, x3, x4)
                  const rb = Math.max(y1, y2, y3, y4)
                  if (rl >= right || rr <= left || rt >= bottom || rb <= top) {
                    continue
                  }
                  targets[count++] = actor
                  continue
                }
              }
            } else {
              // 计算角色的相对位置
              const rx = actor.x - x
              const ry = actor.y - y
              // 以触发区域中心为锚点
              // 逆旋转角色的相对位置
              const ox = rx * cos + ry * sin
              const oy = ry * cos - rx * sin
              // 如果角色的锚点位于矩形触发区域中，则添加到目标列表中
              if (ox >= left && ox < right && oy >= top && oy < bottom) {
                targets[count++] = actor
              }
            }
          }
        }
      }
      targets.count = count
      return targets
    }

    /**
     * 获取圆形碰撞区域中的角色
     * @param {number} x 触发器位置X
     * @param {number} y 触发器位置Y
     * @param {number} angle 触发器角度(弧度)
     * @param {Object} shape 触发器形状参数对象
     * @returns {Actor[]} 角色缓存列表
     */
    'circle' = (x, y, angle, scale, shape) => {
      let count = 0
      const targets = Trigger.actors
      const radius = shape.radius * scale
      const expansion = Trigger.collideWithActorShape ? Scene.binding.maxColliderHalf : 0
      // 获取圆形触发区域所在的角色分区列表
      const cells = Scene.actors.cells.get(
        x - radius - expansion,
        y - radius - expansion,
        x + radius + expansion,
        y + radius + expansion,
      )
      const length = cells.count
      for (let i = 0; i < length; i++) {
        const actors = cells[i]
        const length = actors.length
        for (let i = 0; i < length; i++) {
          const actor = actors[i]
          // 如果角色已激活
          if (actor.active) {
            if (Trigger.collideWithActorShape) {
              switch (actor.collider.shape) {
                case 'circle':
                  if ((x - actor.x) ** 2 + (y - actor.y) ** 2 < (radius + actor.collider.half) ** 2) {
                    targets[count++] = actor
                  }
                  continue
                case 'square':
                  const ox = x - actor.x
                  const oy = y - actor.y
                  const half = actor.collider.half
                  const closestX = Math.clamp(ox, -half, half)
                  const closestY = Math.clamp(oy, -half, half)
                  if ((ox - closestX) ** 2 + (oy - closestY) ** 2 < radius ** 2) {
                    targets[count++] = actor
                  }
                  continue
              }
            } else {
              // 如果角色的锚点位于圆形触发区域中，则添加到目标列表中
              if ((x - actor.x) ** 2 + (y - actor.y) ** 2 < radius ** 2) {
                targets[count++] = actor
              }
            }
          }
        }
      }
      targets.count = count
      return targets
    }

    /**
     * 获取扇形碰撞区域中的角色
     * @param {number} x 触发器位置X
     * @param {number} y 触发器位置Y
     * @param {number} angle 触发器角度(弧度)
     * @param {Object} shape 触发器形状参数对象
     * @returns {Actor[]} 角色缓存列表
     */
    'sector' = (x, y, angle, scale, shape) => {
      let count = 0
      const targets = Trigger.actors
      const radius = shape.radius * scale
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const expansion = Trigger.collideWithActorShape ? Scene.binding.maxColliderHalf : 0
      // 获取圆形触发区域所在的角色分区列表
      const cells = Scene.actors.cells.get(
        x - radius - expansion,
        y - radius - expansion,
        x + radius + expansion,
        y + radius + expansion,
      )
      const length = cells.count
      for (let i = 0; i < length; i++) {
        const actors = cells[i]
        const length = actors.length
        for (let i = 0; i < length; i++) {
          const actor = actors[i]
          // 如果角色已激活
          if (actor.active) {
            const rx = actor.x - x
            const ry = actor.y - y
            if (Trigger.collideWithActorShape) {
              switch (actor.collider.shape) {
                case 'circle': {
                  const square = rx ** 2 + ry ** 2
                  const half = actor.collider.half
                  if (square < (radius + half) ** 2) {
                    const centralAngle = Math.radians(shape.centralAngle)
                    const angle1 = angle - centralAngle / 2
                    const angle2 = angle + centralAngle / 2
                    const angle3 = centralAngle + Math.PI / 2
                    const angle4 = Math.PI * 1.5
                    const angle5 = Math.PI + centralAngle / 2
                    const relativeAngle = Math.modRadians(Math.atan2(ry, rx) - angle1)
                    // 如果角色位于扇形区域内，则添加到目标列表中
                    if (relativeAngle <= centralAngle) {
                      targets[count++] = actor
                    } else if (
                      relativeAngle >= angle3 &&
                      relativeAngle <= angle4) {
                      if (square < half ** 2) {
                        targets[count++] = actor
                      }
                    } else {
                      const angle = relativeAngle > angle5 ? angle1 : angle2
                      const cos = Math.cos(angle)
                      const sin = Math.sin(angle)
                      const ox = rx * cos + ry * sin
                      const oy = ry * cos - rx * sin
                      const px = ox < radius ? ox : radius
                      if ((px - ox) ** 2 + oy ** 2 < half ** 2) {
                        targets[count++] = actor
                      }
                    }
                  }
                  continue
                }
                case 'square': {
                  const ox = x - actor.x
                  const oy = y - actor.y
                  const half = actor.collider.half
                  const closestX = Math.clamp(ox, -half, half)
                  const closestY = Math.clamp(oy, -half, half)
                  if ((ox - closestX) ** 2 + (oy - closestY) ** 2 < radius ** 2) {
                    // 以触发区域中心为锚点
                    // 逆旋转角色的相对位置
                    const ox = rx * cos + ry * sin
                    const oy = ry * cos - rx * sin
                    const angle0 = Math.atan2(oy, ox)
                    const centralAngle = Math.radians(shape.centralAngle)
                    const halfAngle = centralAngle / 2
                    // 如果角色位于扇形区域内，则添加到目标列表中
                    if (angle0 > -halfAngle && angle0 < halfAngle) {
                      targets[count++] = actor
                    } else {
                      const ox = actor.x - x
                      const oy = actor.y - y
                      const ol = ox - half
                      const ot = oy - half
                      const or = ox + half
                      const ob = oy + half
                      const angle1 = Math.modRadians(Math.atan2(ot, ol) - angle + halfAngle)
                      const angle2 = Math.modRadians(Math.atan2(ob, ol) - angle + halfAngle)
                      const angle3 = Math.modRadians(Math.atan2(ob, or) - angle + halfAngle)
                      const angle4 = Math.modRadians(Math.atan2(ot, or) - angle + halfAngle)
                      if (Math.min(angle1, angle2, angle3, angle4) < centralAngle) {
                        targets[count++] = actor
                      }
                    }
                  }
                  continue
                }
              }
            } else {
              // 如果角色的锚点位于圆形触发区域中
              if (rx ** 2 + ry ** 2 < radius ** 2) {
                // 以触发区域中心为锚点
                // 逆旋转角色的相对位置
                const ox = rx * cos + ry * sin
                const oy = ry * cos - rx * sin
                const angle = Math.degrees(Math.atan2(oy, ox))
                const halfAngle = shape.centralAngle / 2
                // 如果角色位于扇形区域内，则添加到目标列表中
                if (angle > -halfAngle && angle < halfAngle) {
                  targets[count++] = actor
                }
              }
            }
          }
        }
      }
      targets.count = count
      return targets
    }
  }

  // 检测与墙壁的碰撞
  static detectCollisionWithWalls = new class {
    /**
     * 检测与墙壁的碰撞 - 穿透
     * @returns {false}
     */
    'penetrate' = () => false

    /**
     * 检测与墙壁的碰撞 - 销毁
     * @returns {boolean} 是否发生了碰撞
     */
    'destroy' = function () {
      return !this.parent.scene.isInLineOfSight(this.lastX, this.lastY, this.x, this.y)
    }
  }

  // 碰撞过滤器
  static collisionFilters = new class {
    /**
     * 碰撞过滤器 - 一次
     * @returns {Actor[]} 角色缓存列表
     */
    'once' = function () {
      let count = 0
      const actors = Trigger.actors
      const hitList = this.hitList
      const length = actors.count
      for (let i = 0; i < length; i++) {
        const actor = actors[i]
        // 如果角色未在碰撞列表中，添加它
        if (!hitList.includes(actor)) {
          actors[count++] = actor
          hitList.push(actor)
        }
      }
      actors.count = count
      return actors
    }

    /** 碰撞过滤器 - 碰撞期间一次 */
    'once-on-overlap' = this.once

    /**
     * 碰撞过滤器 - 重复
     * @returns {Actor[]} 角色缓存列表
     */
    'repeat' = function () {
      let count = 0
      const actors = Trigger.actors
      const time = this.elapsed
      const hitInterval = this.hitInterval
      const hitList = this.hitList
      const timeList = this.timeList
      const length = actors.count
      for (let i = 0; i < length; i++) {
        const actor = actors[i]
        const index = hitList.indexOf(actor)
        // 如果角色未在碰撞列表中，添加它
        if (index === -1) {
          actors[count++] = actor
          hitList.push(actor)
          timeList.push(time)
          continue
        }
        // 如果已经过了碰撞间隔，可以再次碰撞
        const elapsed = time - timeList[index]
        if (elapsed >= hitInterval) {
          timeList[index] += hitInterval
          actors[count++] = actor
          continue
        }
      }
      actors.count = count
      return actors
    }
  }

  // 击中列表更新器
  static hitListUpdaters = new class {
    /** 击中列表更新器 - 一次 */
    'once' = Function.empty

    /** 击中列表更新器 - 碰撞期间一次 */
    'once-on-overlap' = function () {
      if (this.hitList.length > 0) {
        const actors = Trigger.actors
        const count = actors.count
        const hitList = this.hitList
        let i = hitList.length
        outer: while (--i >= 0) {
          const actor = hitList[i]
          // 如果已碰撞的角色还在本轮目标列表中，继续
          for (let i = 0; i < count; i++) {
            if (actors[i] === actor) {
              continue outer
            }
          }
          // 已碰撞的角色已经脱离触发器，移除
          hitList.splice(i, 1)
        }
      }
    }

    /** 击中列表更新器 - 重复 */
    'repeat' = function () {
      if (this.hitList.length > 0) {
        const actors = Trigger.actors
        const count = actors.count
        const time = this.elapsed
        const hitInterval = this.hitInterval
        const hitList = this.hitList
        const timeList = this.timeList
        let i = hitList.length
        outer: while (--i >= 0) {
          const actor = hitList[i]
          // 如果已碰撞的角色还在本轮目标列表中，继续
          for (let i = 0; i < count; i++) {
            if (actors[i] === actor) {
              continue outer
            }
          }
          // 已碰撞的角色已经脱离触发器
          // 且已经过了碰撞间隔，移除
          if (time - timeList[i] >= hitInterval) {
            hitList.splice(i, 1)
            timeList.splice(i, 1)
          }
        }
      }
    }
  }
}