import Foundation
import BlocksRuntime

public class Api {
    private let client: BlocksClient

    public init(server: BlocksServer = Servers.local) {
        self.client = BlocksClient(server: server)
    }

    /// Calls `api.createItem`.
    public func createItem() async throws -> CreateItem.Result {
        let request = BlocksRequest(method: "api.createItem", params: [], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.createItem") }
        return try JSONDecoder().decode(CreateItem.Result.self, from: result)
    }

    public enum CreateItem {

        public struct Result: Codable {
            public let active: Bool
            public let retries: Int
            public let role: String

            public init(active: Bool = true, retries: Int = 3, role: String = "viewer") {
                self.active = active
                self.retries = retries
                self.role = role
            }
        }
    }
}


// MARK: - Servers

public enum Servers {
    public static let local = BlocksServer(name: "local", url: "http://localhost:3001/aws-blocks/api")
}