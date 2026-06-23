export function createTcpClient() {
  return {
    connect() {
      throw new Error('TCP client connection is not implemented yet.')
    },
  }
}
