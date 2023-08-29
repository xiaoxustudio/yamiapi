'use strict'

// ******************************** 编解码器 ********************************

const Codec = new class {
  // 文本编解码器
  textEncoder = new TextEncoder()
  textDecoder = new TextDecoder()

  /**
   * 编码图块
   * @param {Uint8Array} tiles 图块数组
   * @returns {string}
   */
  encodeTiles = function (tiles) {
    const {encodeClone} = this
    const TILES = tiles
    const TILES_LENGTH = TILES.length
    const BYTES = GL.arrays[0].uint8
    let Bi = 0
    let Ti = 0
    while (Ti < TILES_LENGTH) {
      if (TILES[Ti] === 0) {
        let blankCount = 1
        Ti += 1
        while (TILES[Ti] === 0) {
          blankCount++
          Ti++
        }
        if (blankCount <= 16) {
          BYTES[Bi++] = blankCount + 109
        } else {
          BYTES[Bi++] = 126
          Bi = encodeClone(BYTES, Bi, blankCount)
        }
      } else if (TILES[Ti] === TILES[Ti - 1]) {
        let cloneCount = 1
        Ti += 1
        while (TILES[Ti] === TILES[Ti - 1]) {
          cloneCount++
          Ti++
        }
        if (cloneCount <= 10) {
          BYTES[Bi++] = cloneCount + 98
        } else {
          BYTES[Bi++] = 109
          Bi = encodeClone(BYTES, Bi, cloneCount)
        }
      } else {
        const TILE = TILES[Ti]
        BYTES[Bi    ] = (TILE >> 26           ) + 35
        BYTES[Bi + 1] = (TILE >> 20 & 0b111111) + 35
        BYTES[Bi + 2] = (TILE >> 14 & 0b111111) + 35
        BYTES[Bi + 3] = (TILE >> 8  & 0b111111) + 35
        BYTES[Bi + 4] = (TILE       & 0b111111) + 35
        Bi += 5
        Ti += 1
      }
    }
    return this.textDecoder.decode(
      new Uint8Array(BYTES.buffer, 0, Bi)
    )
  }

  /**
   * 解码图块
   * @param {string} code 图块数据编码
   * @param {number} width 瓦片地图宽度
   * @param {number} height 瓦片地图高度
   * @returns {Uint32Array} 图块数据列表
   */
  decodeTiles(code, width, height) {
    const {decodeClone} = this
    const BYTES = this.textEncoder.encode(code)
    const BYTES_LENGTH = BYTES.length
    const TILES = new Uint32Array(width * height)
    const TILES_LENGTH = TILES.length
    let Bi = 0
    let Ti = 0
    while (Bi < BYTES_LENGTH) {
      const CODE = BYTES[Bi]
      if (CODE <= 98) {
        TILES[Ti] =
          (BYTES[Bi    ] - 35 << 26)
        + (BYTES[Bi + 1] - 35 << 20)
        + (BYTES[Bi + 2] - 35 << 14)
        + (BYTES[Bi + 3] - 35 << 8)
        + (BYTES[Bi + 4] - 35)
        Ti += 1
        Bi += 5
      } else if (CODE <= 109) {
        if (CODE !== 109) {
          const COPY = TILES[Ti - 1]
          const END = Ti + CODE - 98
          while (Ti < END) {
            TILES[Ti++] = COPY
          }
          Bi += 1
        } else {
          const {index, count} = decodeClone(BYTES, ++Bi)
          const COPY = TILES[Ti - 1]
          const END = Ti + count
          while (Ti < END) {
            TILES[Ti++] = COPY
          }
          Bi = index
        }
      } else {
        if (CODE !== 126) {
          Ti += CODE - 109
          Bi += 1
        } else {
          const {index, count} = decodeClone(BYTES, ++Bi)
          Ti += count
          Bi = index
        }
      }
    }
    if (Bi !== BYTES_LENGTH || Ti !== TILES_LENGTH) {
      throw new RangeError(`
      Failed to decode tiles.
      Processed bytes: ${Bi} / ${BYTES_LENGTH}
      Restored data: ${Ti} / ${TILES_LENGTH}
      `)
    }
    return TILES
  }

  /**
   * 编码地形
   * @param {Uint8Array} terrains 地形数组
   * @returns {string}
   */
  encodeTerrains(terrains) {
    const {encodeClone} = this
    const TERRAINS = terrains
    const LENGTH = TERRAINS.length
    const BYTES = GL.arrays[0].uint8
    let Bi = 0
    let Ti = 0
    while (Ti < LENGTH) {
      if (TERRAINS[Ti] === 0) {
        let blankCount = 1
        Ti += 1
        while (TERRAINS[Ti] === 0) {
          blankCount++
          Ti++
        }
        if (blankCount <= 49) {
          BYTES[Bi++] = blankCount + 76
        } else if (blankCount <= 98) {
          BYTES[Bi++] = 125
          BYTES[Bi++] = blankCount - 49 + 76
        } else {
          BYTES[Bi++] = 126
          Bi = encodeClone(BYTES, Bi, blankCount)
        }
      } else if (
        TERRAINS[Ti] === TERRAINS[Ti - 1] &&
        TERRAINS[Ti] === TERRAINS[Ti + 1]) {
        let cloneCount = 2
        Ti += 2
        while (TERRAINS[Ti] === TERRAINS[Ti - 1]) {
          cloneCount++
          Ti++
        }
        if (cloneCount <= 25) {
          BYTES[Bi++] = cloneCount + 50
        } else if (cloneCount <= 50) {
          BYTES[Bi++] = 75
          BYTES[Bi++] = cloneCount - 25 + 50
        } else {
          BYTES[Bi++] = 76
          Bi = encodeClone(BYTES, Bi, cloneCount)
        }
      } else {
        BYTES[Bi++] = TERRAINS[Ti++] + 35
      }
    }
    return this.textDecoder.decode(
      new Uint8Array(BYTES.buffer, 0, Bi)
    )
  }

  /**
   * 解码地形
   * @param {SceneContext} scene 场景上下文对象
   * @param {string} code 地形数据编码
   * @param {number} width 场景宽度
   * @param {number} height 场景高度
   * @returns {SceneTerrainArray} 场景地形数据列表
   */
  decodeTerrains(scene, code, width, height) {
    const {decodeClone} = this
    const BYTES = this.textEncoder.encode(code)
    const BYTES_LENGTH = BYTES.length
    const TERRAINS = new SceneTerrainArray(scene, width, height)
    const TERRAINS_LENGTH = TERRAINS.length
    let Bi = 0
    let Ti = 0
    while (Bi < BYTES_LENGTH) {
      const CODE = BYTES[Bi]
      if (CODE <= 50) {
        TERRAINS[Ti] = CODE - 35
        Ti += 1
        Bi += 1
      } else if (CODE <= 76) {
        if (CODE !== 76) {
          const COPY = TERRAINS[Ti - 1]
          const END = Ti + CODE - 50
          while (Ti < END) {
            TERRAINS[Ti++] = COPY
          }
          Bi += 1
        } else {
          const {index, count} = decodeClone(BYTES, ++Bi)
          const COPY = TERRAINS[Ti - 1]
          const END = Ti + count
          while (Ti < END) {
            TERRAINS[Ti++] = COPY
          }
          Bi = index
        }
      } else {
        if (CODE !== 126) {
          Ti += CODE - 76
          Bi += 1
        } else {
          const {index, count} = decodeClone(BYTES, ++Bi)
          Ti += count
          Bi = index
        }
      }
    }
    if (Bi !== BYTES_LENGTH || Ti !== TERRAINS_LENGTH) {
      throw new RangeError(`
      Failed to decode terrains.
      Processed bytes: ${Bi} / ${BYTES_LENGTH}
      Restored data: ${Ti} / ${TERRAINS_LENGTH}
      `)
    }
    return TERRAINS
  }

  /**
   * 编码队伍数据
   * @param {Uint8Array} data 队伍数据列表
   * @returns {string} 队伍数据编码
   */
  encodeTeamData(data) {
    const DATA = data
    const LENGTH = DATA.length
    const BYTES = GL.arrays[0].uint8
    let Bi = 0
    let Ri = 0
    while (Ri < LENGTH) {
      BYTES[Bi++] = 35 + (
        DATA[Ri    ]
      | DATA[Ri + 1] << 1
      | DATA[Ri + 2] << 2
      | DATA[Ri + 3] << 3
      | DATA[Ri + 4] << 4
      | DATA[Ri + 5] << 5
      )
      Ri += 6
    }
    return this.textDecoder.decode(
      new Uint8Array(BYTES.buffer, 0, Bi)
    )
  }

  /**
   * 解码队伍数据
   * @param {string} code 队伍数据编码
   * @param {number} length 队伍数量
   * @returns {Uint8Array} 队伍数据
   */
  decodeTeamData(code, length) {
    const BYTES = this.textEncoder.encode(code)
    const BYTES_LENGTH = BYTES.length
    const DATA_LENGTH = (length + 1) / 2 * length
    const DATA = new Uint8Array(DATA_LENGTH)
    let Bi = 0
    let Ri = 0
    while (Bi < BYTES_LENGTH) {
      const CODE = BYTES[Bi] - 35
      DATA[Ri    ] = CODE      & 0b000001
      DATA[Ri + 1] = CODE >> 1 & 0b00001
      DATA[Ri + 2] = CODE >> 2 & 0b0001
      DATA[Ri + 3] = CODE >> 3 & 0b001
      DATA[Ri + 4] = CODE >> 4 & 0b01
      DATA[Ri + 5] = CODE >> 5
      Ri += 6
      Bi += 1
    }
    if (Bi !== BYTES_LENGTH || Ri < DATA_LENGTH) {
      throw new RangeError(`
      Failed to decode data.
      Processed bytes: ${Bi} / ${BYTES_LENGTH}
      Restored data: ${Ri} / ${DATA_LENGTH}
      `)
    }
    return DATA
  }

  // 编码克隆数据
  encodeClone(array, index, count) {
    const bits = Math.ceil(Math.log2(count + 1))
    const bytes = Math.ceil(bits / 5)
    for (let i = 0; i < bytes; i++) {
      const n = bytes - i - 1
      const head = n !== 0 ? 1 : 0
      const code = head << 5 | count >> n * 5 & 0b011111
      array[index++] = code + 35
    }
    return index
  }

  /**
   * 解码克隆数据
   * @param {Uint8Array} array 字节码列表
   * @param {number} index 字节码索引
   * @returns {{index: number, count: number}} {结束位置, 克隆数量}
   */
  decodeClone(array, index) {
    let count = 0
    let code
    do {
      code = array[index++] - 35
      count = count << 5 | code & 0b011111
    }
    while (code & 0b100000)
    return {index, count}
  }
}