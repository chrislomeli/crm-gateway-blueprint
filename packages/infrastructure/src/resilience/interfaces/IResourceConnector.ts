import {Result} from "@platform/core";


/**
 * Base interface for all resource connectors.
 * Provides common lifecycle methods and state.
 */
export interface IResourceConnector {
  /**
   * Initialize the resource connector.
   * This should be called before using the connector.
   * 
   * @returns A Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  
  /**
   * Whether the connector is currently connected to its resource.
   */
  isConnected(): boolean;
}

/**
 * Interface for resource connectors that send data without expecting a response.
 * Examples: message publishers, log writers, etc.
 * 
 * @template TRequest The type of data being sent
 */
export interface IResourceSender<TRequest> extends IResourceConnector {
  /**
   * Send data to the resource.
   * 
   * @param request The data to send
   * @returns A Result indicating success or failure
   */
  send(request: TRequest): Promise<Result<void>>;
}

/**
 * Interface for resource connectors that receive data.
 * Examples: message consumers, event subscribers, etc.
 * 
 * @template TRequest The type of request/query parameters
 * @template TResponse The type of data being received
 */
export interface IResourceReceiver<TRequest, TResponse> extends IResourceConnector {
  /**
   * Receive data from the resource.
   * 
   * @param request Parameters for the receive operation
   * @returns A Result containing the received data or an error
   */
  receive(): Promise<Result<TResponse>>;
}

/**
 * Interface for bidirectional resource connectors that send requests and receive responses.
 * Examples: database clients, HTTP clients, etc.
 * 
 * @template TRequest The type of request being sent
 * @template TResponse The type of response being received
 */
export interface IResourceClient<TRequest, TResponse> extends IResourceConnector {
  /**
   * Send a request to the resource and receive a response.
   * 
   * @param request The request to send
   * @returns A Result containing the response or an error
   */
  send(request: TRequest): Promise<Result<TResponse>>;
}
