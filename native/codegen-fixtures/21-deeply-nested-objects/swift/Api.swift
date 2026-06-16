import Foundation
import BlocksRuntime

public class Api {
    private let client: BlocksClient

    public init(server: BlocksServer = Servers.local) {
        self.client = BlocksClient(server: server)
    }

    /// Calls `api.getOrganization`.
    public func getOrganization(id: String) async throws -> GetOrganization.Result {
        let request = BlocksRequest(method: "api.getOrganization", params: [id], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.getOrganization") }
        return try JSONDecoder().decode(GetOrganization.Result.self, from: result)
    }

    /// Calls `api.createOrganization`.
    public func createOrganization(input: CreateOrganization.Input) async throws -> CreateOrganization.Result {
        let request = BlocksRequest(method: "api.createOrganization", params: [input], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.createOrganization") }
        return try JSONDecoder().decode(CreateOrganization.Result.self, from: result)
    }

    /// Calls `api.updateOrganization`.
    public func updateOrganization(input: UpdateOrganization.Input) async throws -> UpdateOrganization.Result {
        let request = BlocksRequest(method: "api.updateOrganization", params: [input], id: BlocksRequest.nextId())
        let result = try await client.execute(request)
        guard let result else { throw RPCError(message: "Unexpected null result for api.updateOrganization") }
        return try JSONDecoder().decode(UpdateOrganization.Result.self, from: result)
    }

    public enum GetOrganization {

        public struct Result: Codable {
            public let address: Address
            public let id: String
            public let name: String
            public let owner: Owner

            public struct Address: Codable {
                public let city: String
                public let contact: Contact
                public let street: String

                public struct Contact: Codable {
                    public let email: String
                }
            }

            public struct Owner: Codable {
                public let contact: Contact
                public let name: String

                public struct Contact: Codable {
                    public let email: String
                    public let phone: String
                }
            }
        }
    }

    public enum CreateOrganization {

        public struct Input: Codable {
            public let address: Address
            public let name: String
            public let owner: Owner

            public struct Address: Codable {
                public let city: String
                public let countryCode: String
                public let street: String
            }

            public struct Owner: Codable {
                public let email: String
                public let name: String
            }
        }

        public struct Result: Codable {
            public let id: String
        }
    }

    public enum UpdateOrganization {

        public struct Input: Codable {
            public let address: Address?
            public let id: String
            public let name: String?
            public let owner: Owner?

            enum CodingKeys: String, CodingKey {
                case address
                case id
                case name
                case owner
            }

            public func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(self.address, forKey: .address)
                try c.encode(self.id, forKey: .id)
                try c.encodeIfPresent(self.name, forKey: .name)
                try c.encodeIfPresent(self.owner, forKey: .owner)
            }

            public struct Address: Codable {
                public let city: String
                public let street: String
                public let zip: String
            }

            public struct Owner: Codable {
                public let contact: Contact
                public let name: String

                public struct Contact: Codable {
                    public let email: String
                    public let phone: String
                }
            }
        }

        public struct Result: Codable {
            public let ok: Bool
        }
    }
}


// MARK: - Servers

public enum Servers {
    public static let local = BlocksServer(name: "local", url: "http://localhost:3001/aws-blocks/api")
}