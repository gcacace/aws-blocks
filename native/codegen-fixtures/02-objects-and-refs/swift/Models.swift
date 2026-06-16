import Foundation


public struct Todo: Codable {
    public let done: Bool
    public let id: String
    public let priority: Int
    public let title: String
}