'use strict'

// ******************************** 离屏渲染 - 开始 ********************************

const OffscreenStart = new class {
  /** 开始渲染离屏画面 */
  render() {
    const gl = GL
    // 启用离屏纹理并擦除画布
    gl.enableOffscreen(true)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
}

// ******************************** 离屏渲染 - 结束 ********************************

const OffscreenEnd = new class {
  /** 结束渲染离屏画面 */
  render() {
    const gl = GL
    // 禁用离屏纹理并复制纹理像素到画布中
    gl.enableOffscreen(false)
    gl.blend = 'copy'
    // 如果用blitFramebuffer在抗锯齿模式下会报错
    const program = gl.imageProgram.use()
    const vertices = gl.arrays[0].float32
    vertices[0] = -1
    vertices[1] = 1
    vertices[2] = 0
    vertices[3] = 0
    vertices[4] = -1
    vertices[5] = -1
    vertices[6] = 0
    vertices[7] = 1
    vertices[8] = 1
    vertices[9] = -1
    vertices[10] = 1
    vertices[11] = 1
    vertices[12] = 1
    vertices[13] = 1
    vertices[14] = 1
    vertices[15] = 0
    gl.bindVertexArray(program.vao.a110)
    gl.vertexAttrib1f(program.a_Opacity, 1)
    gl.uniformMatrix3fv(program.u_Matrix, false, gl.matrix.reset())
    gl.uniform1i(program.u_LightMode, 0)
    gl.uniform1i(program.u_ColorMode, 0)
    gl.uniform4f(program.u_Tint, 0, 0, 0, 0)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW, 0, 16)
    gl.bindTexture(gl.TEXTURE_2D, gl.offscreen.current.base.glTexture)
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
  }
}

// ******************************** 染色器对象 ********************************

const Tinter = new class {
  // 色调数组
  tint = [0, 0, 0, 0]

  /** 更新场景色调 */
  update() {
    const {tint} = this
    if (tint[0] === 0 &&
      tint[1] === 0 &&
      tint[2] === 0 &&
      tint[3] === 0) {
      Scene.filters.delete('tint')
    } else {
      Scene.filters.set('tint', this)
    }
  }

  /** 重置色调 */
  reset() {
    if (this.transition) {
      this.transition.remove()
      delete this.transition
    }
    this.tint[0] = 0
    this.tint[1] = 0
    this.tint[2] = 0
    this.tint[3] = 0
    Scene.filters.delete('tint')
  }

  /** 渲染场景色调 */
  render() {
    const gl = GL
    // 切换离屏纹理
    gl.switchOffscreen()
    gl.blend = 'copy'
    // 复制染色后的画面到当前的离屏纹理
    gl.drawImage(gl.offscreen.last, 0, 0, gl.width, gl.height, this.tint)
  }

  /**
   * 设置场景色调: 红[-255, 255] 绿[-255, 255] 蓝[-255, 255] 灰[0, 255]
   * @param {Array<number>} tint 色调数组
   * @param {string} easingId 过渡曲线ID
   * @param {number} duration 持续时间(毫秒)
   */
  set(tint, easingId, duration) {
    // 如果上一次的色调过渡未结束，移除
    if (this.transition) {
      this.transition.remove()
      delete this.transition
    }
    if (duration > 0) {
      // 设置场景滤镜模块：色调渲染器
      Scene.filters.set('tint', this)
      const start = Array.from(this.tint)
      const end = tint
      const easing = Easing.get(easingId)
      // 创建色调过渡计时器
      this.transition = new Timer({
        duration: duration,
        update: timer => {
          const tint = this.tint
          const time = easing.map(timer.elapsed / duration)
          tint[0] = Math.clamp(start[0] * (1 - time) + end[0] * time, -255, 255)
          tint[1] = Math.clamp(start[1] * (1 - time) + end[1] * time, -255, 255)
          tint[2] = Math.clamp(start[2] * (1 - time) + end[2] * time, -255, 255)
          tint[3] = Math.clamp(start[3] * (1 - time) + end[3] * time, 0, 255)
        },
        callback: () => {
          delete this.transition
          // 检查是否需要删除渲染器
          this.update()
        },
      }).add()
    } else {
      // 直接设置色调
      this.tint[0] = tint[0]
      this.tint[1] = tint[1]
      this.tint[2] = tint[2]
      this.tint[3] = tint[3]
      this.update()
    }
  }
}